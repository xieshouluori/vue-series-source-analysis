export function install(_Vue) {
  //判断是否安装过该插件
  //_VUe为Vue对象，如果Vue变量已经有值，并且等于_Vue，则代表该插件已经安装过
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      );
    }
    return;
  }
  Vue = _Vue;
  //调用applyMixin
  applyMixin(Vue);
}
逻辑：（把传入的 _Vue 赋值给 Vue 并执行了 applyMixin(Vue) 方法）
二步：
步一：判断是否安装过该插件  安装过，直接return；若没有安装过，将_Vue赋值给Vue
步二：调用 applyMixin方法，参数为Vue对象。

// applyMixin方法
export default function (Vue) {
  //获取VUe的版本号
  const version = Number(Vue.version.split('.')[0])
  if (version >= 2) {
    //Vue版本大于2时，全局混入了一个 beforeCreate 钩子函数；
    // 影响注册之后所有创建的每个 Vue 实例。
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // 当Vue版本小于2时，重写_init方法，注入VueInit
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }
逻辑：Vue版本大于2时，全局混入beforeCreate钩子函数。每个组件实例化后都会调用这个beforeCreate方法



  // store注入
  // 将this.$options.xxxx.store注入到每个组件的this.$store属性中.这个 options.store 就是我们在实例化 Store 对象的实例
  function vuexInit () {
    const options = this.$options
    if (options.store) {
      //该组件本身的参数中有store属性，一般为根组件才有store组件
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      //该组件的父级有store属性
      this.$store = options.parent.$store
    }
  }
}

目的：全局为每个组件注入this.$store，在每个组件中通过this.$store访问到共享状态。
逻辑：将this.$options.xxxx.store注入到每个组件的this.$store属性中.

二步：
步一:判断该组件本身参数中是否有store属性，
  如果本身有（为根组件时），将 options.store赋值给 该组件的$tore属性。
  如果本身没有，则看父组件是否有$store属性，如果有，将父组件的$tore赋值给 该组件的$store;

