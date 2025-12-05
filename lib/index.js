import { append ,clear ,remove } from './linked-list.js'

export * from './async.js'

var
  scope
  
  ,isTracking = false
  ,isFlushing = false
  ,isBatching = false

  ,immediateQueue = []
  ,queue = []

  ,queues = [immediateQueue ,queue]
  ,queuesSize = queues.length

  ,types = { memo: 0 ,immediate: 1 ,effect: 2 }

  ,states = { clean: 0 ,dirty: 1 ,target: 2 }

export var getScope = () => scope

export function untrack (fn ,...args) {
  if (!isTracking) return fn.apply(undefined ,args)

  isTracking = false

  try {
    return fn.apply(undefined ,args)
  } finally {
    isTracking = true
  }
}

function schedule (subscribers) {
  if (!subscribers.hd) return

  var
    stack = []
    
    ,item = subscribers.hd
    ,value

  while (item) {
    value = item.v

    if (value.state != states.target) (
      (!isFlushing && (value.state == states.clean)) && stack.push(value)
      
      ,(value.state = states.target)
    )

    item = item.n
  }

  while (stack.length) {
    value = stack.pop()

    if (value.type == types.immediate) { immediateQueue.push(value) ;continue }
    else if (value.type == types.effect) { queue.push(value) ;continue }

    item = value.subs?.hd

    while (item) {
      value = item.v

      if (value.state == states.clean) (
        (value.state = states.dirty)
        
        ,stack.push(value)
      )

      item = item.n
    }
  }

  if (!isFlushing && !isBatching) flush()
}

export function batch (fn ,...args) {
  if (isBatching) return fn.apply(undefined ,args)

  isBatching = true

  try {
    return fn.apply(undefined ,args)
  } finally {
    flush()

    isBatching = false
  }
}

function resolveUpstreams (obs) {
  var
    stack = []

    ,idx = 0 ,obsLength = obs.length

    ,obsValue
    
    ,currentScope ,tracking

  for (;idx < obsLength ;idx++) (
    (obsValue = obs[idx])

    ,(obsValue.state != states.clean) && stack.push(obsValue)
  )

  while (stack.length) {
    obsValue = stack[stack.length - 1]

    switch (obsValue.state) {
      case states.clean: stack.pop() ;continue

      case states.target:
        stack.pop()

        if (obsValue.touched) obsValue.touched = undefined
  
        currentScope = scope
        tracking = isTracking
  
        scope = obsValue
        isTracking = true
        
        obsValue.memo(obsValue.fn)
  
        scope = currentScope
        isTracking = tracking

        continue
    }

    if (obsValue.touched) {
      stack.pop()

      obsValue.touched = undefined

      obsValue.state = states.clean
      
      continue
    }

    obsValue.touched = true

    stack.push.apply(stack ,obsValue.obs)
  }
}

export var onCleanup = fn => (
  scope?.clups
    ? scope.clups.push(fn)
    : (scope.clups = [fn])

  ,fn
)

function dispose (scope) {
  var
    stack = [scope]
    
    ,length ,idx ,v

  while (length = stack.length) {
    scope = stack[(idx = length - 1)]

    if (scope.dpTchd) {
      stack.pop()

      scope.dpTchd = undefined

      if (idx) (scope.state != states.clean) && (scope.state = states.clean)
      else if (scope.hd) clear(scope)

      if (scope.obs.length) scope.obs.length = 0

      for (
        idx = scope.obsSubs.length - 1

        ;((v = scope.obsSubs[idx]) ,idx > -1)

        ;idx--
      ) remove(v.subs ,v)

      if (scope.obsSubs.length) scope.obsSubs.length = 0

      length = scope.clups?.length

      if (length) {
        for (idx = 0 ;idx < length ;idx++) scope.clups[idx]()

        scope.clups = undefined
      }
    }
    else {
      scope.dpTchd = true

      v = scope.hd

      while (v) { stack.push(v) ;v = v.n }
    }
  }
}

function flush () {
  if (isFlushing) return

  var
    queueIdx = 0
    ,currentQueue

    ,effectIdx ,effect

    ,currentScope ,tracking
    
    ,batching = isBatching

  isFlushing = true

  if (!batching) isBatching = true

  for (;queueIdx < queuesSize ;queueIdx++) {
    currentQueue = queues[queueIdx].sort((a ,b) => a.lvl - b.lvl)

    for (effectIdx = 0 ;effectIdx < currentQueue.length ;effectIdx++) {
      effect = currentQueue[effectIdx]

      if (effect.state == states.dirty) resolveUpstreams(effect.obs)

      if (effect.state == states.target) {
        dispose(effect)

        currentScope = scope
        tracking = isTracking

        scope = effect
        isTracking = true

        effect.value = effect.fn(effect.value)

        scope = currentScope
        isTracking = tracking
      }

      effect.state = states.clean
    }
  }

  immediateQueue.length = queue.length = 0

  if (!batching) isBatching = false

  isFlushing = false
}

export function createSignal (value ,config) {
  var
    subs = {}
    
    ,currentScope ,tracking
    
    ,observer = (scope?.type == types.memo) && !scope?.subs && (
      (scope.subs = subs)

      ,scope
    )
    
    ,isEqual = config?.isEqual ?? Object.is
    
    ,get = () => (
      isTracking && (
        scope.obsSubs.push(
          append(subs, { v: scope ,subs })
        )

        ,observer && scope.obs.push(observer)
      )

      ,observer && (
        (observer.state == states.dirty) && resolveUpstreams(observer.obs)

        ,(observer.state == states.target)
          ? (
            (currentScope = scope)
            ,(tracking = isTracking)
    
            ,(scope = observer)
            ,(isTracking = true)
    
            ,set(observer.fn)
    
            ,(scope = currentScope)
            ,(isTracking = tracking)
          )
          : (observer.state = states.clean)
      )

      ,value
    )
    
    ,set = val => {
      if (scope == observer) (
        dispose(observer)

        ,(val = batch(val ,value))
      )
      else if (typeof val == 'function') val = val(value)

      if (!isEqual || !isEqual(value ,val)) (
        (value = val)

        ,observer && ((observer.value = value) ,(observer.state = states.clean))

        ,schedule(subs)
      )
      else observer && (observer.state = states.clean)
      
      return value
    }

  return [ get ,set ]
}

export function createImmediateEffect (fn ,value) {
  var
    effectScope = {
      parent: scope
      ,fn
      ,type: types.immediate
      ,memo: undefined
      ,state: states.target
      ,value
      ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
      ,ctx: scope?.ctx
      ,obs: []
      ,obsSubs: []
      ,subs: undefined
      ,dpTchd: undefined ,touched: undefined
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  effectScope.state = states.clean

  isTracking = tracking
  scope = effectScope.parent
}

export function createMemo (fn ,value ,config) {
  var
    get

    ,effectScope = {
      parent: scope
      ,fn
      ,type: types.memo
      ,memo: undefined // Signal setter
      ,state: states.target
      ,value
      ,lvl: scope?.lvl ?? 0
      ,ctx: scope?.ctx
      ,obs: []
      ,obsSubs: []
      ,subs: undefined
      ,dpTchd: undefined ,touched: undefined
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  ;[get ,effectScope.memo] = createSignal(
    (effectScope.value = fn(value))

    ,config
  )

  effectScope.state = states.clean

  isTracking = tracking
  scope = effectScope.parent

  return get
}

export function createEffect (fn ,value) {
  var
    effectScope = {
      parent: scope
      ,fn
      ,type: types.effect
      ,memo: undefined
      ,state: states.target
      ,value
      ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
      ,ctx: scope?.ctx
      ,obs: []
      ,obsSubs: []
      ,subs: undefined
      ,dpTchd: undefined ,touched: undefined
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  if (isBatching) { queue.push(effectScope) ;return }

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  effectScope.state = states.clean

  isTracking = tracking
  scope = effectScope.parent
}

export var createContext = v => ({ v ,i: Symbol('ctx') })

export var useContext = ctx => scope.ctx?.[ctx.i] ?? ctx.v

export var addContext = ({ i } ,value) => (scope.ctx = { ...scope.ctx ,[i]: value })

export function createRoot (fn) {
  var v ,rootScope

  createImmediateEffect(() => (
    (rootScope = scope)

    ,(v = batch(untrack ,fn ,() => dispose(rootScope)))
  ))

  return v
}
