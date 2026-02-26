import {
  getScope ,createMemo ,createSignal ,batch ,createContext ,useContext ,onCleanup ,createImmediateEffect
} from './reaction.js'

var
  states = {loading: 1 ,resolved: 2 ,rejected: 3}

  ,idx

export var suspenseContext = createContext(/*{inc ,dec}*/)

function incSuspenses (suspenses) {for (idx = suspenses.length - 1 ;idx > -1 ;idx--) suspenses[idx].inc()}
function decSuspenses (suspenses) {for (idx = suspenses.length - 1 ;idx > -1 ;idx--) suspenses[idx].dec()}

export function createAsync (fn ,value ,config) {
  var
    scope ,promise ,setError ,setLoading, suspenses

    ,state = ((value != undefined) && (value != null)) ? states.resolved : states.loading

    ,f = async () => fn(value)

    ,[refetchSignal ,setRefetchSignal] = createSignal(undefined ,{ isEqual: false })

    ,loading = createMemo(p => (
      !scope && (scope = getScope())

      ,refetchSignal()

      ,(promise && (state != states.loading)) && (
        (state = states.loading)
        
        ,suspenses?.length && incSuspenses(suspenses)
      )

      ,(p = promise = f()).then(
        v => (p == promise) && (
          (value = v)

          ,(state = states.resolved)

          ,batch(() => (setData(v) ,setError() ,setLoading(false) ,suspenses && decSuspenses(suspenses)))
        )
        ,e => (p == promise) && (
          (state = states.rejected)

          ,batch(() => (setData() ,setError(e) ,setLoading(false) ,suspenses && decSuspenses(suspenses)))
        )
      )

      ,(state == states.loading)
    ))

    ,[data ,setData] = createSignal(value ,config)

    ,getData = () => {
      var v = getData.error() ?? data() ,ctx = useContext(suspenseContext)

      if (ctx) {
        if (suspenses) suspenses.push(ctx) ;else suspenses = [ctx]

        if (state == states.loading) ctx.inc()

        onCleanup(() => (
          suspenses.splice(suspenses.indexOf(ctx) ,1)

          ,(state == states.loading) && ctx.dec()
        ))
      }

      if (state != states.rejected) return v

      throw v
    }

  setLoading = scope.memo

  ;[getData.error ,setError] = createSignal()

  getData.loading = loading

  getData.latest = data

  createImmediateEffect(loading) //Make loading memo alive

  return [getData ,{
    mutate: v => (
      batch(() => ((value = setData(v)) ,setError() ,setLoading(false)))
      
      ,(state = states.resolved)
      
      ,value
    )

    ,refetch () { setRefetchSignal() }
  }]
}
