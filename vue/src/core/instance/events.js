/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  // 在vm上创建一个_events对象，用来存放事件对象。(只存放挂载在该组件上的事件)
  vm._events = Object.create(null)
  // _hasHookEvent属性是表示父组件是否有将钩子函数绑定到该组件上。
  // 而不需要通过哈希表的方法来查找是否有钩子，这样做可以减少不必要的开销，优化性能。
  vm._hasHookEvent = false
  // 初始化父组件绑定在该组件上的事件
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  // 绑定事件
  // $on方法主要就是将事件push到vue实例的_events对象对应事件属性下。
  target.$on(event, fn)
}

function remove (event, fn) {
  // 移除事件
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  //  remove和add方法是Vue中自己实现两个添加Listener、移除Listener的方法。
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // 当wevent参数为数组时，遍历数组，将其中的每一项递归调用vm.$on
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    // 当使用了once时，执行一次之后，便调用$off方法移除事件
    const vm: Component = this
    function on () {
      // 只要事件一触发，便移除监听器
      vm.$off(event, on)
      // 执行fn函数，并将参数arguments传递给函数fn
      fn.apply(vm, arguments)
    }
    // 保存fn函数到on函数上，以便于当我们使用拦截器代替监听器注入到时间列表中，移除监听器时操作有效
    // （因为拦截器和用户提供的函数是不相同的，此时我们可以找寻fn属性来执行移除操作）
    /* 
        function handle () {
          // ...
        }
        比如：this.$once('handle', handle); (内部使用的是vm.$on(event, on))
              当想要清除监听器时，我们可以使用
              this.$off('handle', handle)
              内部通过cb.fn === fn（即on.handle === handle）来判断清除监听器
    */
    on.fn = fn
    // on函数是对fn函数做一层包装（除了要执行相应的处理函数之外，还要对监听器进行移除）
    vm.$on(event, on)
    return vm
  }

  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // 不传参数，将所有事件清空
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // 当event参数为数组时，遍历数组，将其中的每一项递归调用vm.$off
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // 判断是否存在该自定义事件监听器
    const cbs = vm._events[event]
    // 如果不存在，则直接返回实例
    if (!cbs) {
      return vm
    }
    // 只传第一个参数（没有传入fn），则将_events对象下的该属性事件数组清空
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    let cb
    let i = cbs.length
    // 移除与传入的fn相同的监听器
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // $emit方法就是直接触发vue实例下的_events对象中的方法。
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    // 从_events中取出相应的事件监听器回调函数列表
    let cbs = vm._events[event]
    if (cbs) {
      // toArray的作用：将类数组转换成真正的数组
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // toArray的第二个参数是指起始位置，也就是说args是一个数组，里面包含除第一个参数之外的所有参数
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        // 执行cbs中的回调函数，只不过其中使用了try...catch语句来捕获错误
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
