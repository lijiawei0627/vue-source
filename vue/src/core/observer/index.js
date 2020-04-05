/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// 它的作⽤是给对象的属性添加getter和setter，⽤于依赖收集和派发更新
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    // 实例化一个Dep对象
    // （注意，该dep实例被存放在Observer实例上，而且该Observer实例会被存放到当前value的__ob__属性上）
    this.dep = new Dep()
    this.vmCount = 0
     // 通过def函数将当前的Observer的实例赋给value上新增的一个不可枚举的属性__ob__，
    // 这样我们就可以通过数据的__ob__属性拿到Observer实例，然后就可以拿到__ob__上的dep了
    // 当然__ob__的作用不仅仅是为了在拦截器中访问Observer实例这么简单，还可以用来标记当前value是否
    // 已经被转换为响应式数据。
    def(value, '__ob__', this)
    // 如果data中有属性是数组，将修改后可以截获响应的数组方法替换掉该数组的原型中的原生方法，
    // 达到监听数组数据变化响应的效果。这里如果当前浏览器支持__proto__属性，
    // 则直接覆盖当前数组对象原型，如果不支持该属性，
    // 则直接将arrayMethods身上的方法设置到被侦测的数组身上。
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 如果是数组则需要遍历数组的每一个成员进行observe
      this.observeArray(value)
    } else {
      // 如果是对象则直接walk进行绑定
      this.walk(value)
    }
  }

  // 遍历每一个对象并且在它们上面绑定getter与setter。
  // 这个方法只有在value的类型是对象的时候才能被调用
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // 通过defineReactive方法来定义⼀个响应式对象，给对象动态添加getter和setter方法
      defineReactive(obj, keys[i])
    }
  }

  // 对一个数组的每一个成员进行observe
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
// 直接覆盖原型的方法来修改目标对象或数组
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
// 定义（覆盖）目标对象或数组的某一个方法
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// observe的功能就是⽤来监测数据的变化
//  尝试创建一个Observer实例（__ob__），
// 如果成功创建Observer实例则返回新的Observer实例，
// 如果已有Observer实例则返回现有的Observer实例。
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // value必须是一个对象，而且不是一个VNode实例
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 这里用__ob__这个属性来判断是否已经有Observer实例，
  // 如果没有Observer实例则会新建一个Observer实例并赋值给__ob__这个属性，
  // 如果已有Observer实例则直接返回该Observer实例
  // 避免重复
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 在闭包中定义一个dep对象(依赖收集和派发的仓库)
  const dep = new Dep()

  // 拿到传入obj中key的一些定义
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // 如果之前该数据对象已经预设了getter以及setter函数则将其取出来，
  // 新定义的getter/setter中会将其执行，保证不会覆盖之前已经定义的getter/setter。
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 对象的子对象递归进行observe并返回子节点的Observer对象，不断的进行递归observe
  let childOb = !shallow && observe(val)

  // 将数据变成响应式对象
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 如果原本对象拥有getter方法则优先执行原有的getter方法
      const value = getter ? getter.call(obj) : val
      // Dep.target为一个全局的Watcher
      if (Dep.target) {
        // 通过dep的depend进行依赖收集
        dep.depend()
        console.log(dep)
        // 子对象进行依赖收集，其实就是将同一个watcher观察者实例放进了两个depend中，
        // 一个是正在本身闭包中的depend（例如对象obj），另一个是子元素的depend（例如obj.a）
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            // 是数组则需要对每一个成员都进行依赖收集，如果数组的成员中有对象类型，则递归。
            // 对于数组中object身上所有属性，也要进行依赖收集
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 通过getter方法获取当前值，与新值进行比较，一致则不需要执行下面的操作
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        // 如果原本对象拥有setter方法则优先执行原有的setter方法
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 如果新的值为对象的话，需要重新进行observe，保证数据响应式
      childOb = !shallow && observe(newVal)
      // dep对象通知所有的观察者(派发更新)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果target是数组并且key是一个有效值
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 如果我们传递的索引值大于当前数组的length，就需要让target的length等于索引值
    target.length = Math.max(target.length, key)
    // 使用splice把val设置到target时，数组拦截器会侦测到target发生变化，
    // 并且会自动帮助我们把这个新增的val转成响应式
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    // 如果key已经存在target中，直接修改数据
    target[key] = val
    return val
  }
  // 获取target的__ob__
  const ob = (target: any).__ob__
  // 因为target不能时Vue实例或Vue实例的根数据对象，所以此处进行判断
  // target._isVue判断是否为Vue实例，ob.vmCount判断是否为根数据
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果target不是响应式，那么就直接通过key和val在target身上设置即可
  if (!ob) {
    target[key] = val
    return val
  }
  // 如果前面的条件都不满足，那么使用defineReactive将新增属性转换成getter/setter形式即可
  defineReactive(ob.value, key, val)
  // 派发更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果是数组，就利用splice方法来执行删除操作
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 使用splice删除元素时,数组拦截器会侦测到target发生变化,自动派发更新
    target.splice(key, 1)
    return
  }
  // 获取target的__ob__
  const ob = (target: any).__ob__
  // 因为target不能时Vue实例或Vue实例的根数据对象，所以此处进行判断
  // target._isVue判断是否为Vue实例，ob.vmCount判断是否为根数据
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 如果target中没有key属性,那么直接返回
  if (!hasOwn(target, key)) {
    return
  }
  // 从target中将key删除
  delete target[key]
  if (!ob) {
    // 如果target不是响应式数据,则直接返回
    return
  }
  // 派发更新
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
