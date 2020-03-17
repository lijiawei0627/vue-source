/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

export function initLifecycle (vm: Component) {
  // 拿到options
  const options = vm.$options

  // 将vm对象存储到parent组件的$children中（保证parent组件是非抽象组件，比如keep-alive）
  let parent = options.parent
  if (parent && !options.abstract) {
    // 在方法的开头逐级查找到以第一个非抽象的父级，
    // 如果 parent.$parent存在 且 parent.$options.abstract 为真，再次往上寻找
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 从当前Vue实例vm开始向上查找，找到最近的一级abstract为false的parent。将vm push给它的$children
    parent.$children.push(vm)
  }

  // 指定已创建的实例之父实例，在两者之间建立父子关系。
  vm.$parent = parent
  // 当前组件树的根 Vue 实例。如果当前实例没有父实例，此实例将会是其自己。
  vm.$root = parent ? parent.$root : vm
  // 当前实例的直接子组件。需要注意 $children 并不保证顺序，也不是响应式的。
  vm.$children = []
  // 一个对象，持有已注册过 ref 的所有子组件。
  vm.$refs = {}

  // 组件实例相应的 watcher 实例对象。
  vm._watcher = null
  // 表示keep-alive中组件状态，如被激活，该值为false,反之为true。
  vm._inactive = null
  // 也是表示keep-alive中组件状态的属性。
  vm._directInactive = false
  // 当前实例是否完成挂载(对应生命周期图示中的mounted)。
  vm._isMounted = false
  // 当前实例是否已经被销毁(对应生命周期图示中的destroyed)。
  vm._isDestroyed = false
  // 当前实例是否正在被销毁,还没有销毁完成(介于生命周期图示中deforeDestroy和destroyed之间)。  
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 首次渲染和数据改变都会调用_updata方法
  // _update的核⼼就是调⽤vm.__patch__⽅法，
  // 这个⽅法实际上在不同的平台，⽐如web和weex上的定义是不⼀样的
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // 更新新的实例对象的__vue__
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    // 更新watcher，手动执行实例watcher的update方法
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    // 如果_isBeingDestroyed为true，说明实例正在被销毁，直接使用return语句退出函数，避免反复销毁
    if (vm._isBeingDestroyed) {
      return
    }
    // 触发beforeDestroy钩子函数
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // 清除当前组件与父组件之间的连接
    // 拿到父组件
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      // 如果父组件存在，且未被销毁，则将当前组件实例从父组件实例的$children属性中删除
      remove(parent.$children, vm)
    }
    // 该组件下的所有Watcher从其所在的Dep中释放
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // 移除__ob__属性
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // 给通过给实例添加_isDestroyed属性来表示实例已被销毁
    vm._isDestroyed = true
    // 将模板中的所有指令解绑
    vm.__patch__(vm._vnode, null)
    // 调用destroyed钩子函数
    callHook(vm, 'destroyed')
    // 移除所有的事件监听
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

// mountComponent核⼼就是先调⽤vm._render⽅法先⽣成虚拟Node，再实例化⼀个渲染Watcher，
// 在它的回调函数中会调⽤updateComponent⽅法，最终调⽤vm._update更新DOM
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 对传入的el做缓存
  vm.$el = el
  // 接下来进行一系列的校验
  if (!vm.$options.render) {
    // 经过前面的转换，render函数依然不存在时，就会创建一个空的VNode
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
          // 在开发环境下，当我们使用了RuntimeOnly版本的Vue时，没有写render函数，而是使用template
          // 就会报警告（因此在RuntimeOnly版本下，不会对template进行编译生成render函数）
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(  // 既没有定义template也没有定义render函数，也会进行报警告
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 执行beforeMount钩子函数（因此模板编译是在created和beforeMount生命周期之间）
  callHook(vm, 'beforeMount')
  // 声明updateComponent变量，方便在实例化一个Watcher的时候，在它的回调函数中调⽤updateComponent⽅法
  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    // 	定义updateComponent⽅法
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      // 生成vnode
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 	定义updateComponent⽅法
    updateComponent = () => {
      // 执行vue._render()生成虚拟dom（VNode），
      // 再将其传入vm._update，_update 的核心就是调用 vm.__patch__ 方法，渲染成真实dom
      vm._update(vm._render(), hydrating)
    }
  }

  // 这里对该实例注册一个Watcher实例，Watcher的getter为updateComponent函数，
  // 用于触发所有渲染所需要用到的数据的getter，
  // 进行依赖收集，该Watcher实例会存在所有渲染所需数据的闭包Dep中
  // 此处的Watcher为渲染Watcher（除了渲染watcher之外，还存在computed watcher、user watcher等等）

  // Watcher在这⾥起到两个作⽤，⼀个是初始化的时候会执⾏回调函数，
  // 另⼀个是当vm实例中的监测的数据发⽣变化的时候执⾏回调函数
  new Watcher(vm, updateComponent, noop, {
    before () {
      // 如果已经该组件已经挂载过了则代表进入这个步骤是个更新的过程，触发beforeUpdate钩子
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    // 标志位，代表该组件已经挂载
    vm._isMounted = true
    // 组件挂载完成之后，执行mounted钩子函数
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 拿到用户定义的相对应的钩子函数
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
