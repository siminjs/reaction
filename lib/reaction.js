import {append ,clear ,remove} from './linked-list.js'

var
  scope
  
  ,isTracking = false ,isFlushing = false ,isBatching = false
  
  ,MEMO = 1 ,IMMEDIATE = MEMO << 1 ,EFFECT = IMMEDIATE << 1 ,IMMEDIATE_EFFECT = IMMEDIATE | EFFECT
  ,DIRTY = EFFECT << 1 ,TARGET = DIRTY << 1 ,DIRTY_TARGET = DIRTY | TARGET
  ,TCHD = TARGET << 1 ,DPTCHD = TCHD << 1
  
  ,queue = [] ,scopePool = [] ,subscriberPool = []

  ,currentEffectIdx = 0

  ,befMid ,befItem ,befItemFlag ,befFlag ,befLow ,befHigh ,befInsertIndex // binaryEffectInsert variables

export var
  stack = []

  ,getScope = () => scope

export function callBy (scp ,fn ,...args) {
  var
    currentScope = scope
    ,tracking = isTracking

  if (currentScope != scp) scope = scp
  if (!tracking) isTracking = true

  try {
    return fn.apply(undefined ,args)
  } finally {
    if (currentScope != scp) scope = currentScope
    if (!tracking) isTracking = false
  }
}

export function untrack (fn ,...args) {
  if (!isTracking) return fn.apply(undefined ,args)

  isTracking = false

  try {
    return fn.apply(undefined ,args)
  } finally {
    isTracking = true
  }
}

function binaryEffectInsert (queue ,scope ,startIndex = 0) {
  befFlag = scope.f & IMMEDIATE_EFFECT
  befLow = startIndex
  befHigh = queue.length - 1
  befInsertIndex = queue.length

  while (befLow <= befHigh) {
    befItem = queue[befMid = (befLow + befHigh) >> 1]
    befItemFlag = befItem.f & IMMEDIATE_EFFECT

    if (
      (befItemFlag > befFlag) || ((befItemFlag == befFlag) && (befItem.lvl > scope.lvl))
    ) {befInsertIndex = befMid ;befHigh = befMid - 1}
    else befLow = befMid + 1
  }

  queue.splice((befInsertIndex < startIndex) ? startIndex : befInsertIndex ,0 ,scope)

  befItem = undefined

  return queue
}

function schedule (subscribers ,isMemo) {
  if (!subscribers.hd) return

  var
    currentStackLen = stack.length
    
    ,item = subscribers.hd
    ,value

  while (item) {
    value = item.v

    if (!(value.f & TARGET)) (
      ((!isMemo ||  !isFlushing) && !(value.f & DIRTY)) && stack.push(value)
      
      ,(value.f |= DIRTY_TARGET)
    )

    item = item.n
  }

  while (stack.length > currentStackLen) {
    value = stack.pop()

    if (value.f & IMMEDIATE_EFFECT) {binaryEffectInsert(queue ,value ,currentEffectIdx) ;continue}

    item = value.subs?.hd

    while (item) {
      value = item.v

      if (!(value.f & DIRTY)) (
        (value.f |= DIRTY)
        
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

  try {return fn.apply(undefined ,args)}
  finally {flush() ;isBatching = false}
}

function resolveUpstreams (obs) {
  var
    currentStackLen = stack.length

    ,idx = 0 ,len = obs.length

    ,obsValue
    
    ,currentScope ,tracking

  for (;idx < len ;idx++) (
    (obsValue = obs[idx])

    ,(obsValue.f & DIRTY) && stack.push(obsValue)
  )

  while ((len = stack.length) > currentStackLen) {
    obsValue = stack[len - 1]

    if (!(obsValue.f & DIRTY)) {stack.pop() ;continue}
    
    else if (obsValue.f & TARGET) {
      stack.pop()

      if (obsValue.f & TCHD) obsValue.f &= ~TCHD

      currentScope = scope
      tracking = isTracking

      scope = obsValue
      isTracking = true
      
      obsValue.memo(obsValue.fn)

      scope = currentScope
      isTracking = tracking

      continue
    }

    else if (obsValue.f & TCHD) {
      stack.pop()

      obsValue.f &= ~TCHD & ~DIRTY
      
      continue
    }

    obsValue.f |= TCHD

    stack.push.apply(stack ,obsValue.obs)
  }
}

export var onCleanup = fn => scope && (
  scope.clups ? scope.clups.push(fn) : (scope.clups = [fn])

  ,fn
)

export function dispose (scope ,isRoot) {
  var
    currentStackLen = stack.length
    
    ,length ,idx ,v

  stack.push(scope)

  while ((length = stack.length) > currentStackLen) {
    scope = stack[(idx = length - 1)]

    if (scope.f & DPTCHD) {
      stack.pop()

      scope.f &= ~DPTCHD

      if ((idx - currentStackLen) || isRoot) (
        (scope.f & DIRTY) && (scope.f &= ~DIRTY_TARGET)

        ,(scope.parent = scope.fn = /*scope.ctx =*/ scope.value = scope.subs =
          scope.memo = scope.p = scope.n = scope.tl = scope.hd = undefined)
        
        ,scopePool.push(scope)
      )
      else if (scope.hd) clear(scope)

      if (scope.obs.length) scope.obs.length = 0

      for (
        idx = scope.obsSubs.length - 1

        ;((v = scope.obsSubs[idx]) ,idx > -1)

        ;idx--
      ) (remove(v.subs ,v) ,(v.v = v.subs = v.p = v.n = undefined) ,subscriberPool.push(v))

      if (scope.obsSubs.length) scope.obsSubs.length = 0

      length = scope.clups?.length

      if (length) {
        for (idx = 0 ;idx < length ;idx++) {
          try {scope.clups[idx]()}
          catch (e) {useContext(errorBoundaryContext ,scope).throw(e)}
        }

        scope.clups.length = 0
      }

      if (!scope.fn) scope.ctx = undefined
    }
    else {
      scope.f |= DPTCHD

      v = scope.hd

      while (v) {stack.push(v) ;v = v.n}
    }
  }
}

function flush () {
  if (isFlushing) return

  var effect ,currentScope ,tracking ,batching = isBatching

  isFlushing = true

  if (!batching) isBatching = true

  for (;(effect = queue[currentEffectIdx++]) ;) {
    if ((effect.f & DIRTY_TARGET) == DIRTY) resolveUpstreams(effect.obs)

    if (effect.f & TARGET) {
      currentScope = scope
      tracking = isTracking

      scope = effect
      isTracking = true

      dispose(effect)

      try {effect.value = effect.fn(effect.value)}
      catch (e) {useContext(errorBoundaryContext ,effect).throw(e)}

      scope = currentScope
      isTracking = tracking
    }

    if (effect.f & DIRTY_TARGET) effect.f &= ~DIRTY_TARGET
  }

  if (!batching) isBatching = false

  isFlushing = false

  queue.length = currentEffectIdx = 0
}

export function createSignal (value ,config) {
  var
    subs = {tl: undefined ,hd: undefined}
    
    ,currentScope ,tracking
    
    ,observer = (scope?.f & MEMO) && !scope.subs && (
      (scope.subs = subs)

      ,scope
    )
    
    ,isEqual = config?.isEqual ?? Object.is
    
    ,get = sub => (
      isTracking && (
        (sub = subscriberPool.pop()) && ((sub.v = scope) ,(sub.subs = subs))

        ,scope.obsSubs.push(
          append(subs, sub || {v: scope ,subs ,n: undefined ,p: undefined})
        )

        ,observer && scope.obs.push(observer)
      )

      ,((observer.f & DIRTY_TARGET) == DIRTY) && resolveUpstreams(observer.obs)

      ,(observer.f & DIRTY_TARGET) && (
        (observer.f & TARGET)
          ? (
            (currentScope = scope)
            ,(tracking = isTracking)
    
            ,(scope = observer)
            ,(isTracking = true)
    
            ,set(observer.fn)
    
            ,(scope = currentScope)
            ,(isTracking = tracking)
          )
          : (observer.f &= ~DIRTY/*_TARGET*/)
      )

      ,value
    )
    
    ,set = val => (
      (scope == observer)
        ? (dispose(observer) ,(val = batch(val ,value)))
        : (typeof val == 'function') && (val = val(value))

      ,(!isEqual || !isEqual(value ,val))
        ? (
          (value = val)
          
          ,observer && ((observer.value = value) ,(observer.f &= ~DIRTY_TARGET))

          ,schedule(subs ,scope == observer)
        )
        : observer && (observer.f &= ~DIRTY_TARGET)
      
      ,value
    )

  return [get ,set]
}

export function createImmediateEffect (fn ,value) {
  var effectScope = scopePool.pop() ,tracking = isTracking

  if (effectScope) (
    (effectScope.parent = scope)
    ,(effectScope.fn = fn)
    ,(effectScope.f = IMMEDIATE | DIRTY_TARGET)
    ,(effectScope.lvl = scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1))
    ,(effectScope.ctx = scope?.ctx)
    ,(effectScope.value = value)
  )
  else (effectScope = {
    parent: scope
    ,fn
    ,f: IMMEDIATE | DIRTY_TARGET
    ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
    ,ctx: scope?.ctx
    ,value
    ,obs: []
    ,obsSubs: []
    ,subs: undefined
    ,memo: undefined
    ,clups: undefined
    ,p: undefined ,n: undefined ,tl: undefined ,hd: undefined
  })

  if (scope) append(scope, effectScope)

  scope = effectScope
  if (!tracking) isTracking = true

  try {effectScope.value = fn(value)}
  catch (e) {useContext(errorBoundaryContext ,effectScope).throw(e)}

  effectScope.f &= ~DIRTY_TARGET

  if (!tracking) isTracking = false
  scope = effectScope.parent
}

export function createMemo (fn ,value ,config) {
  var get ,effectScope = scopePool.pop() ,tracking = isTracking

  if (effectScope) (
    (effectScope.parent = scope)
    ,(effectScope.fn = fn)
    ,(effectScope.f = MEMO | DIRTY_TARGET)
    ,(effectScope.lvl = scope?.lvl ?? 0)
    ,(effectScope.ctx = scope?.ctx)
    ,(effectScope.value = value)
  )
  else (effectScope = {
    parent: scope
    ,fn
    ,f: MEMO | DIRTY_TARGET
    ,lvl: scope?.lvl ?? 0
    ,ctx: scope?.ctx
    ,value
    ,obs: []
    ,obsSubs: []
    ,subs: undefined
    ,memo: undefined // Signal setter
    ,clups: undefined
    ,p: undefined ,n: undefined ,tl: undefined ,hd: undefined
  })

  if (scope) append(scope, effectScope)

  scope = effectScope
  if (!tracking) isTracking = true

  try {effectScope.value = fn(value)}
  catch (e) {useContext(errorBoundaryContext ,effectScope).throw(e)}

  ;[get ,effectScope.memo] = createSignal(effectScope.value ,config)

  effectScope.f &= ~DIRTY_TARGET

  if (!tracking) isTracking = false
  scope = effectScope.parent

  return get
}

export function createEffect (fn ,value) {
  var effectScope = scopePool.pop() ,tracking = isTracking

  if (effectScope) (
    (effectScope.parent = scope)
    ,(effectScope.fn = fn)
    ,(effectScope.f = EFFECT | DIRTY_TARGET)
    ,(effectScope.lvl = scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1))
    ,(effectScope.ctx = scope?.ctx)
    ,(effectScope.value = value)
  )
  else (effectScope = {
    parent: scope
    ,fn
    ,f: EFFECT | DIRTY_TARGET
    ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
    ,ctx: scope?.ctx
    ,value
    ,obs: []
    ,obsSubs: []
    ,subs: undefined
    ,memo: undefined
    ,clups: undefined
    ,p: undefined ,n: undefined ,tl: undefined ,hd: undefined
  })

  if (scope) append(scope, effectScope)

  if (isBatching) {binaryEffectInsert(queue ,effectScope ,currentEffectIdx) ;return}

  scope = effectScope
  if (!tracking) isTracking = true

  try {effectScope.value = fn(value)}
  catch (e) {useContext(errorBoundaryContext ,effectScope).throw(e)}

  effectScope.f &= ~DIRTY_TARGET

  if (!tracking) isTracking = false
  scope = effectScope.parent
}

export var createContext = v => ({v ,i: Symbol('ctx')})

export var useContext = (ctx ,scp = scope) => scp?.ctx?.[ctx.i] ?? ctx.v

export var addContext = ({i} ,value) => (scope.ctx = {...scope.ctx ,[i]: value})

export function createRoot (fn) {
  var rootScope

  createImmediateEffect(() => (
    (rootScope = scope)

    ,batch(untrack ,fn ,() => dispose(rootScope ,true))
  ))

  return rootScope.value
}

export var errorBoundaryContext = createContext({throw (e) {throw e}})
