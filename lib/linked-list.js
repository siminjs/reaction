// createItem = (v ,p ,n) => ({ ...v ,p ,n })

// createList = (hd, tl) => ({ hd: hd || tl ,tl: tl || hd })

// function forEach (list ,fn) {
//   let item = list.hd
//   let next

//   while (item) {
//     next = item.n

//     fn(item)

//     item = next
//   }
// }

// function forEachRight (list ,fn) {
//   let item = list.tl
//   let next

//   while (item) {
//     next = item.p

//     fn(item)

//     item = next
//   }
// }

export var append = (list ,item) => (
  list.tl = (
    list.tl
      ? ((item.p = list.tl) ,(list.tl.n = item))
      : (list.hd = item)
  )
)

export var prepend = (list ,item) => (
  list.hd = (
    list.hd
      ? ((item.n = list.hd) ,(list.hd.p = item))
      : (list.tl = item)
  )
)

export var remove = (list ,item) => (
  (item == list.hd) && (list.hd = item.n)
  ,(item == list.tl) && (list.tl = item.p)

  ,item.p && (item.p.n = item.n)
  ,item.n && (item.n.p = item.p)

  ,item
)

export var clear = list => ((list.hd = list.tl = undefined) ,list)

/** iteration */
// var push = (list, stack, cmd) => list?.hd && stack.push([cmd, list])

// var slicers = ['shift', 'pop']

// var iterate = (fns ,lists, isDeep) => fns && lists && ((
//   cmds = Object.keys(fns)

//   ,slicer = slicers[+!!isDeep]
  
//   ,stack = []
  
//   ,_push = (list, cmd) => push(list, stack, cmd)
  
//   ,cmd, list
// ) => {
//   Object.values(cmds).forEach((cmd, idx) => (cmds[cmd] = idx))

//   lists.forEach((list, idx) => _push(list, cmds[idx]))

//   while (stack.length) {
//     [cmd, list] = stack[slicer]()

//     forEach(list, ({ v }) => fns[cmd](v, cmds, _push))
//   }
// })()
