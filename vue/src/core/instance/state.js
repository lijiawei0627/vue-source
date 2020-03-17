/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  // 在此处将vm上的data进行了代理，当我们访问vm[key]时，实际上访问的是vm[sourcekey][key]
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
// 初始化props、methods、data、computed与watch
// 先初始化props，后初始化data，这样就可以在data中使用props中的数据了。在watch中既可以观察props
// 又可以观察data，所以它是最后初始化的
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 初始化props
  if (opts.props) initProps(vm, opts.props)
  // 初始化方法
  if (opts.methods) initMethods(vm, opts.methods)
  // 初始化data
  if (opts.data) {
    initData(vm)
  } else {
    // 该组件没有data的时候绑定一个空对象
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化computed
  debugger
  if (opts.computed) initComputed(vm, opts.computed)
  // 初始化watchers
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  // propsData保存的是通过父组件传入或用户通过propsData传入的真实的props数据
  const propsData = vm.$options.propsData || {}
  // 将props指向vm._props
  const props = vm._props = {}
  // 缓存属性的key，使得将来能直接使用数组的索引值来更新props而不是动态地枚举对象
  const keys = vm.$options._propKeys = []
  // 根据$parent是否存在来判断当前是否是根结点，
  // 如果不是，那么不需要将props数据转换成响应式数据。
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    // 通过toggleObserving函数来确定并控制defineReactive函数调用时所传入的value参数
    // 是否需要转换成响应式。
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    // 验证prop,不存在用默认值替换，类型为bool则声称true或false，
    // 当使用default中的默认值的时候会将默认值的副本进行observe
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      // 判断是否是保留字段，如果是则发出warning
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 通过defineReactive函数，将props上的属性转换成响应式数据，
      // 同时将通过调用validate函数得到的props数据设置到vm._props中
      // 注意：此时的参数中的props是指向于vm._props的
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 最后将props中的属性代理到vm身上，当使用vm[key]访问数据时，
      // 其实访问的是vm._props[key]
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  // 获取到vue中定义的data
  let data = vm.$options.data
  // 判断data类型是否为函数，然后执行getData函数，获取data中的数据
  // 并将获取到的数据赋给vm._data和data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 最终获取到的data必须为对象，否则会报出警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // 拿到data中的key值、props、methods等数据
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
   // 遍历data中的数据
  while (i--) {
    const key = keys[i]
    // 因为最终data、methods、props中的属性都会挂载到vm实例上，
    // 所以应该保证data中的key不与methods、props中的key重复，
    // props优先，data次之，然后再考虑methods。
    // 如果有冲突会产生warning
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 通过proxy把每⼀个值vm._data.xxx都代理到vm.xxx上；
      proxy(vm, `_data`, key)
    }
  }
  // 观测整个data的变化，把data也变成响应式
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 执行Vue中的data函数，并且将结果返回
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  debugger
  // 用来保存计算属性的内部监视器watcher
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    // 拿到计算属性的每一个userDef
    const userDef = computed[key]
    // 计算属性可能是一个function，也有可能是设置了get以及set的对象。
    // 如果是一个函数,那么直接将它赋给getter变量,如果是一个对象,那么便取出get属性赋给getter变量
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    // 当用户定义的computed属性不是一个函数,并且对象中没有get方法时,getter为空时,程序会进行报错
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      // 每个computed至少有个getter，否则会报错
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // 为计算属性创建一个内部的监视器Watcher，保存在vm实例的_computedWatchers中
      // 这里的computedWatcherOptions参数传递了一个lazy为true，
      // 会使得watch实例的dirty为true
      // 当dirty属性为true时，说明需要重新计算“计算属性”的返回值；
      // 当dirty属性为false时，说明计算属性的值并没有变，不需要重新计算。
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // 组件正在定义的计算属性已经定义在现有组件的原型上则不会进行重复定义
    if (!(key in vm)) {
      // 定义计算属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果计算属性与已定义的data或者props中的名称冲突则发出warning
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 定义计算属性
// 利⽤Object.defineProperty给计算属性对应的key值添加getter和setter
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()  // true
  if (typeof userDef === 'function') {
    // 创建计算属性的getter
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)

    // 当userDef是一个function的时候是不需要setter的，所以这边给它设置成了空函数。
    // 因为计算属性默认是一个function，只设置getter。
    // 当需要设置setter的时候，会将计算属性设置成一个对象。
    sharedPropertyDefinition.set = noop
  } else {
    // get不存在则直接给空函数，如果存在则查看是否有缓存cache，
    // 没有依旧赋值get，有的话使用createComputedGetter创建
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop

    // 如果有设置set方法则直接使用，否则赋值空函数
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 创建计算属性的getter
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    // 实际是脏检查，在计算属性中的依赖发生改变的时候dirty会变成true，
    // 在get的时候重新计算计算属性的输出值
    if (watcher) {
      // 当dirty为true时，重新计算计算属性的返回值,并将dirty设为false
      if (watcher.dirty) {
        watcher.evaluate()
        /*
          evaluate () {
            this.value = this.get()
            this.dirty = false
          }
        */
      }
      // 进行依赖收集
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 每个methods的属性对应的都应该是一个函数,否则会报错
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // 如果methods和props中存在属性名冲突,那么会报出警告
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      // 判断是否为保留字
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    // 对watch对象做遍历，拿到每⼀个handler
    const handler = watch[key]
    // Vue是⽀持watch的同⼀个key对应多个handler，所以如果handler是⼀个数组，则遍历这个数组
    // 如果该监听属性是数组则遍历进行createWatcher
    // (如果watch同一个key对应多个handler，那么最后一个handler会覆盖前面所有的handler)
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 创建一个观察者Watcher
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 对对象类型进行严格检查，只有当对象是纯javascript对象的时候返回true
  if (isPlainObject(handler)) {
     /*
      这里是当watch的写法是这样的时候
      watch: {
          test: {
              handler: function () {},
              deep: true
          }
      }
    */
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    // 当然，也可以直接使用vm中methods的方法
    handler = vm[handler]
  }
  // 用$watch方法创建一个watch来观察该对象的变化
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    // 返回一个取消观察函数，用来停止触发回调。
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
