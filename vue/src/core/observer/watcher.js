/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// 进行依赖收集的观察者，同时在表达式数据变更时触发回调函数。
// 它被用于$watch api以及指令
// Dep实际上就是对Watcher的⼀种管理，Dep脱离Watcher单独存在是没有意义的
// 注意：Watcher有三类：normal-watcher（自定义Watcher，即我们在watcher中定义的都属于这类型）、
// computed-watcher（computed属性生成的Watcher对象）、render-watcher（渲染watcher，用来更新视图）
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    // 组件实例
    vm: Component,
    // 传过来的updateComponent函数或者computed[key].getter
    expOrFn: string | Function,
    // 空函数noop
    cb: Function,
    // 配置项
    options?: ?Object,
    // 是否为渲染Watcher的一个标志位
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // 如果是渲染watcher，那么就会把该watcher赋值给组件实例的_watcher属性
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // _watchers存放该组件的所有的订阅者实例
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // 实例化computed watcher时，this.lazy为true
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // 当expOrFn为函数时，直接将它赋给getter，而且watcher会同时观察expOrFn函数中
    // 读取的所有Vue实力上的响应式数据，也就是说如果函数从Vue实例上读取了两个数据
    // 那么watcher会同时观察这两个数据的变化，当其中任意一个发生变化时，watcher都会得到通知。
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 如果不是函数，再使用parsePath函数来读取属性路径中的数据
      // 如：a.b.c.d就是一个属性路径，说明从vm.a.b.c.d中读取数据
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        // 监视路径失败：“${expOrFn}”
        // Watcher只接受简单的点分隔路径。对于完全控制，请改用函数。
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  //  获得getter的值并且重新进行依赖收集
  get () {
    // 将自身watcher观察者实例设置给Dep.target，用以依赖收集。
    // pushTarget的作用参考简书随笔
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 此处执行getter函数，实际上执行的是传入的回调函数
      // 可能是updateComponent函数，进行了渲染操作；
      // 也可能是computed的getter计算函数，获取计算值；也可能是watch的回调函数
      value = this.getter.call(vm, vm)
    } catch (e) {
      // 执行了getter操作，看似执行了渲染操作，其实是执行了依赖收集。
      // 在将Dep.target设置为自生观察者实例以后，执行getter操作。
      // 譬如说现在的的data中可能有a、b、c三个数据，getter渲染需要依赖a跟c，
      // 那么在执行getter的时候就会触发a跟c两个数据的getter函数，
      // 在getter函数中即可判断Dep.target是否存在然后完成依赖收集，
      // 将该观察者对象放入闭包中的Dep的subs中去。
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // 当设置了deep时，使用traverse方法，对该被监听数据进行深层次依赖收集
      // 除了要触发当前这个被监听数据的收集依赖的逻辑之外，还要把当前监听的这个值在内的
      // 所有子值都触发一遍收集依赖逻辑。
      // 使得对象或数组的每一个成员都被依赖收集，形成一个“深（deep）”依赖关系
      // （递归value的所有子值来触发它们收集依赖的功能）
      if (this.deep) {
        traverse(value)
      }
      // 将观察者实例从target栈中取出并设置给Dep.target，恢复上一级组件的target（watcher）
      popTarget()
      // 当依赖收集完成之后，进行一个清空依赖操作
      // 为什么需要做`deps`订阅的移除呢，在添加`deps`的订阅过程，已经能通过id去重避免重复 订阅了。 
      // 考虑到⼀种场景，我们的模板会根据v-if去渲染不同⼦模板a和b，
      // 当我们满⾜某种条件的时候渲染a的时候，会访问到a中的数据，这时候我们对a使⽤的数据添加了	
      // getter，做了依赖收集，那么当我们去修改a的数据的时候，理应通知到这些订阅者。
      // 那么如果我们⼀旦改变了条件渲染了b模板， ⼜会对b使⽤的数据添加了getter，
      // 如果我们没有依赖移除的过程，那么这时候我去修改a模板的数据，会通知a数据的订阅的回调，
      // 这显然是有浪费的。 
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  //  添加一个依赖关系到Deps集合中，而不是添加一个watcher
  // this.deps 和 this.newDeps 表示 Watcher 实例持有的 Dep 实例的数组；
  // 观察者对象的deps数组中存放着与这个观察者有关的数据Dep。所以数据的Dep与Watcher其实是多对多关系
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    //  清空deps
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 将newDeps、newDepIds分别赋给deps、depIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    // 清空newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 调度者接口，当依赖发生改变的时候进行回调。
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      // 同步则执行run直接渲染视图
      this.run()
    } else {
      // 异步推送到观察者队列中，下一个tick时调用。
      // 在⼀般组件数据更新的场景，会⾛到最后⼀个queueWatcher(this)的逻辑，
      // 其中涉及到异步更新的问题
      // queueWatcher的定义在src/core/observer/scheduler.js中：
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 调度者工作接口，将被调度者回调。
  run () {
    if (this.active) {
      //  get操作在获取value本身也会执行getter从而调用updateComponent方法更新视图 
      const value = this.get()
      if (
        value !== this.value ||
        // 即便值相同，拥有Deep属性的观察者以及在对象／数组上的观察者应该被触发更新，
        // 因为它们的值可能发生改变。
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 触发回调
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  //  获取观察者的值
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  //  收集该watcher的所有deps依赖
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  //  将自身从所有依赖收集订阅列表删除
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 从vm实例的观察者列表中将自身移除，由于该操作比较耗费资源，
      // 所以如果vm实例正在被销毁则跳过该步骤。
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
