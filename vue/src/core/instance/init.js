/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 在Vue原型上定义_init方法
  Vue.prototype._init = function (options?: Object) {
    // vm指向Vue实例
    const vm: Component = this
    // 全局记数 表示有几个vue实例
    vm._uid = uid++

    let startTag, endTag
    // 这里的config.performance开发版默认是false
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 一个防止vm实例自身被观察的标志位
    vm._isVue = true
    // 合并配置项
    // options._isComponent 用来记录当前options是否属于组件。
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // initInternalComponent函数其作用是初始化内部组件。
      initInternalComponent(vm, options)
    } else {
      // 否则，将传入的options与vm本身的属性进行了合并，并重新赋值给vm.$options
      // Vue实例会将传入的用户自定义options合并到自身属性中。
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 进行初始化代理
      initProxy(vm)
    } else {
      // 如果在生产环境下，直接把vm实例赋给vm._renderProxy
      vm._renderProxy = vm
    }
    // 把自身的实例给暴露出来，传递给其他方法，为Vue的实例添加各种接口，事件，以及可调用的属性
    vm._self = vm
    // 初始化⽣命周期 
    initLifecycle(vm)
    // 初始化事件中⼼
    initEvents(vm)
    // 初始化渲染
    initRender(vm)
    // 在执行beforeCreate钩子之前，要先初始化生命周期、事件中心、渲染
    callHook(vm, 'beforeCreate')
    // 在data/props之前初始化inject，
    // 这样做的目的是让用户可以在data/props中使用inject所注入的内容
    initInjections(vm)
    // 初始化props、methods、data、computed、watcher等等。 
    initState(vm)
    // Provide在初始化data和props之后被初始化
    initProvide(vm)
    // 当所有初始化完成之后，调用created钩子函数 
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      // 对组件名进行格式化
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 检测到如果有el属性，则调⽤`vm.$mount`⽅法挂载`vm`，
    // 挂载的⽬标就是把模板渲染成最终的DOM
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
