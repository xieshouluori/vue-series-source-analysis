import applyMixin from './mixin';
import devtoolPlugin from './plugins/devtool';
import ModuleCollection from './module/module-collection';
import { forEachValue, isObject, isPromise, assert } from './util';

let Vue; // bind on install

export class Store {
  //构造函数，默认传入{}
  constructor(options = {}) {
    // 如果没有安装vuex，且当前环境是浏览器环境，则会自动安装vuex
    // 它允许用户在某些情况下避免自动安装。
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue);
    }
    // 如果是开发环境，进行断言检查，来保证程序的稳定;
    if (process.env.NODE_ENV !== 'production') {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(
        typeof Promise !== 'undefined',
        `vuex requires a Promise polyfill in this browser.`
      );
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      );
    }

    const {
      // 一个数组，包含应用在store上的插件方法。
      // 插件就是一个函数，直接接受store作为唯一的参数，可以接听mutation或者提交mutation
      plugins = [],
      /*使 Vuex store 进入严格模式，在严格模式下，任何 mutation 处理函数以外修改 Vuex state 都会抛出错误。*/
      strict = false,
    } = options;

    // store internal state
    // 用于判断严格模式下是否是通过mutation修改state的;
    this._committing = false;
    // 存放action
    this._actions = Object.create(null);
    // action订阅列表
    this._actionSubscribers = [];
    // 存放mutation;
    this._mutations = Object.create(null);
    // 存放getter
    this._wrappedGetters = Object.create(null);
    // module收集器---对传入的options进行处理，生成模块集合
    // store 可以分割成模块（module），每个模块拥有自己的 state、mutation、action、getter。store 本身可以理解为一个 root module，它下面的 modules 就是子模块。
    this._modules = new ModuleCollection(options);
    // 根据namespace存放module
    this._modulesNamespaceMap = Object.create(null);
    // 存放订阅者
    this._subscribers = [];
    // 通过vue实例实现watch监听变化
    this._watcherVM = new Vue();

    // bind commit and dispatch to self
    // *将dispatch与commit调用的this绑定为store对象本身，否则在组件内部this.dispatch时的this会指向组件的vm*/
    const store = this;
    const { dispatch, commit } = this;
    // 为dispatch绑定this（Store实例本身）
    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload);
    };
    //  为commit绑定this（Store实例本身）
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options);
    };
    // strict mode
    /*严格模式(使 Vuex store 进入严格模式，在严格模式下，任何 mutation 处理函数以外修改 Vuex state 都会抛出错误)*/
    this.strict = strict;
    // 数据树---从module树中取出state
    const state = this._modules.root.state;

    // init root module.
    // 安装模块，注册根module，并递归注册所有子module
    // 目标就是对模块中的 state、getters、mutations、actions 做初始化工作
    // 搜集所以module到_modulesNamespaceMap中;
    // Vue.set()---> state;
    // 构造本地上下文 module.context，返回一个local对象，包含dispatch 和 commit方法、getters，state属性。
    // 将所有mutations中的方法 注册到 wrappedMutationHandler中
    // 将所有actions中的方法 注册到 wrappedActionHandler中
    // 将所有getters中的方法注册到wrappedGetter中
    installModule(this, state, [], this._modules.root);

    // 功能：将 store中的getter方法和state实现为响应式，实现store的数据与视图的同步更新。
    // 核心：新建Vue实例，使用Vue内部的响应式
    // 逻辑：
    // 步一：遍历wrappedGetters，使用Object.defineProperty方法为每一个getter绑定上get方法
    // （get方法指向Vue实例中computed的方法。这样在组件里访问this.$store.getter.test就等同于访问store._vm.test。也就是Vue对象的computed属性）
    // 步二：new一个Vue对象来实现数据的“响应式化”，运用Vue.js内部提供的数据双向绑定功能来实现store的数据与视图的同步更新。

    resetStoreVM(this, state);

    // apply plugins
    // 调用插件
    plugins.forEach(plugin => plugin(this));

    // devtool插件
    const useDevtools =
      options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }
  // Store.state 调用的是 Vue实例中的data的值
  get state() {
    return this._vm._data.$$state;
  }

  set state(v) {
    if (process.env.NODE_ENV !== 'production') {
      assert(
        false,
        `use store.replaceState() to explicit replace store state.`
      );
    }
  }
  // 功能： store 提供了commit 方法让我们提交一个 mutation去修改state
  // 逻辑：
  //     根据type找到并调用_mutations中的所有type对应的mutation方法
  //     执行完所有的mutation之后会执行_subscribers中的所有订阅者
  commit(_type, _payload, _options) {
    // 校验参数
    const { type, payload, options } = unifyObjectStyle(
      _type,
      _payload,
      _options
    );

    const mutation = { type, payload };

    //在_mutations中提取出type对应的mutation的方法
    const entry = this._mutations[type];
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return;
    }
    // 遍历执行 提取出来的mutation中的所有方法,
    this._withCommit(() => {
      entry.forEach(function commitIterator(handler) {
        handler(payload);
      });
    });
    // 通知所有订阅者
    this._subscribers.forEach(sub => sub(mutation, this.state));

    if (process.env.NODE_ENV !== 'production' && options && options.silent) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
          'Use the filter functionality in the vue-devtools'
      );
    }
  }
  // 功能： 调用action的dispatch方法
  // 逻辑：
  //     根据type找到_actions中的type对应的函数数组
  //     将找到的函数通过Promise.all包装后再返回
  //     执行完所有的action之后会执行_actionSubscribers中的所有action订阅者
  dispatch(_type, _payload) {
    // 校验参数
    const { type, payload } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    // 从 store._actions 找到type对应的函数数组
    const entry = this._actions[type];
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return;
    }

    try {
      this._actionSubscribers
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state));
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }
    // 如果找到的actions 是数组则包装Promise形成一个新的Promise,所有的 promise 都“完成（resolved）”时回调完成（resolve），如果找到的actions只有一个则直接返回第0个
    const result =
      entry.length > 1
        ? Promise.all(entry.map(handler => handler(payload)))
        : entry[0](payload);

    return result.then(res => {
      try {
        this._actionSubscribers
          .filter(sub => sub.after)
          .forEach(sub => sub.after(action, this.state));
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[vuex] error in after action subscribers: `);
          console.error(e);
        }
      }
      return res;
    });
  }
  // 注册一个订阅函数
  subscribe(fn) {
    return genericSubscribe(fn, this._subscribers);
  }

  subscribeAction(fn) {
    const subs = typeof fn === 'function' ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers);
  }
  //  功能 观察一个getter方法
  //  原理：使用Vue实例内部的watch特性
  watch(getter, cb, options) {
    if (process.env.NODE_ENV !== 'production') {
      assert(
        typeof getter === 'function',
        `store.watch only accepts a function.`
      );
    }
    // _watcherVM是一个Vue的实例，所以watch就可以直接采用了Vue内部的watch特性提供了一种观察数据getter变动的方法。
    return this._watcherVM.$watch(
      () => getter(this.state, this.getters),
      cb,
      options
    );
  }

  replaceState(state) {
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }
  // 功能： 注册一个动态module，当业务进行异步加载的时候，可以通过该接口进行注册动态module 
  // 逻辑：步一：注册module
  //     步二：初始化module
  //     步三：重置store
  registerModule(path, rawModule, options = {}) {
    // 将路径转化称Array
    if (typeof path === 'string') path = [path];

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(
        path.length > 0,
        'cannot register the root module by using registerModule.'
      );
    }
    /*注册modules到组件树中*/
    this._modules.register(path, rawModule);
    // 初始化这个新module
    installModule(
      this,
      this.state,
      path,
      this._modules.get(path),
      options.preserveState
    );
    // reset store to update getters...
    // 通过vm重设store，新建Vue对象使用Vue内部的响应式实现注册state以及computed
    resetStoreVM(this, this.state);
  }
  // 功能：注销一个动态module
  // 逻辑：步一：注销module
  //     步二：从父级中删除module和对应的state
  //     步三：重置store
  unregisterModule(path) {
  //  路径 转化称Array
    if (typeof path === 'string') path = [path];

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }
    /*注销*/
    this._modules.unregister(path);
    this._withCommit(() => {
      /* 获取父级的state */
      const parentState = getNestedState(this.state, path.slice(0, -1));
      /* 从父级中删除 */
      Vue.delete(parentState, path[path.length - 1]);
    });
    /* 重制store */
    resetStore(this);
  }

  hotUpdate(newOptions) {
    this._modules.update(newOptions);
    resetStore(this, true);
  }

  // 调用withCommit修改state的值时会将store的committing值置为true，内部会有断言检查该值，在严格模式下只允许使用mutation来修改store中的值，而不允许直接修改store的数值
  _withCommit(fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}
// 注册一个订阅函数，即将该订阅函数push到Store实例的_subscribers中，同时返回一个从_subscribers中注销该订阅者的方法。
function genericSubscribe(fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn);
  }
  return () => {
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  };
}
功能： 重制store
逻辑： 将store中的_actions等进行初始化以后，重新执行installModule与resetStoreVM来初始化module以及用Vue特性使其“响应式化”，
function resetStore(store, hot) {
  store._actions = Object.create(null);
  store._mutations = Object.create(null);
  store._wrappedGetters = Object.create(null);
  store._modulesNamespaceMap = Object.create(null);
  const state = store.state;
  // init all modules
  installModule(store, state, [], store._modules.root, true);
  // reset vm
  resetStoreVM(store, state, hot);
}

// 遍历收集到的get方法赋给store.getters，并通过Object.defineProperty拦截每个方法的get
// new一个Vue，将sotre中的state和每个getter变为响应式。
function resetStoreVM(store, state, hot) {
  const oldVm = store._vm;
  store.getters = {};
  const wrappedGetters = store._wrappedGetters;
  const computed = {};
  //遍历wrappedGetters（gettter收集器中的方法，往store.getters添加方法）
  forEachValue(wrappedGetters, (fn, key) => {
    computed[key] = () => fn(store);
    //属性截取--- 通过Object.defineProperty为每一个getter方法设置get方法，比如获取this.$store.getters.test的时候获取的是store._vm.test，也就是Vue对象的computed属性
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true,
    });
  });
  const silent = Vue.config.silent;
  // Vue.config.silent暂时设置为true的目的是在new一个Vue实例的过程中不会报出一切警告
  Vue.config.silent = true;
  // new了一个Vue对象，运用Vue内部的响应式实现注册state以及computed,将store中的state和getters的方法赋给Vue中的$$state和computed
  store._vm = new Vue({
    data: {
      $$state: state,
    },
    computed,
  });
  Vue.config.silent = silent;
  // enable strict mode for new vm
  // 使能严格模式，保证修改store只能通过mutation
  if (store.strict) {
    enableStrictMode(store);
  }
  if (oldVm) {
    // 解除旧vm的state的引用，以及销毁旧的Vue对象
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    Vue.nextTick(() => oldVm.$destroy());
  }
}

function installModule(store, rootState, path, module, hot) {
  const isRoot = !path.length;
  const namespace = store._modules.getNamespace(path);

  // register in namespace map
  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module;
  }

  // set state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1));
    const moduleName = path[path.length - 1];
    store._withCommit(() => {
      Vue.set(parentState, moduleName, module.state);
    });
  }

  const local = (module.context = makeLocalContext(store, namespace, path));

  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key;
    registerMutation(store, namespacedType, mutation, local);
  });

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key;
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext(store, namespace, path) {
  const noNamespace = namespace === '';

  const local = {
    dispatch: noNamespace
      ? store.dispatch
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options);
          const { payload, options } = args;
          let { type } = args;

          if (!options || !options.root) {
            type = namespace + type;
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._actions[type]
            ) {
              console.error(
                `[vuex] unknown local action type: ${
                  args.type
                }, global type: ${type}`
              );
              return;
            }
          }

          return store.dispatch(type, payload);
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options);
          const { payload, options } = args;
          let { type } = args;

          if (!options || !options.root) {
            type = namespace + type;
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._mutations[type]
            ) {
              console.error(
                `[vuex] unknown local mutation type: ${
                  args.type
                }, global type: ${type}`
              );
              return;
            }
          }

          store.commit(type, payload, options);
        },
  };

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace),
    },
    state: {
      get: () => getNestedState(store.state, path),
    },
  });

  return local;
}

function makeLocalGetters(store, namespace) {
  const gettersProxy = {};

  const splitPos = namespace.length;
  Object.keys(store.getters).forEach(type => {
    // skip if the target getter is not match this namespace
    if (type.slice(0, splitPos) !== namespace) return;

    // extract local getter type
    const localType = type.slice(splitPos);

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true,
    });
  });

  return gettersProxy;
}

function registerMutation(store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = []);
  entry.push(function wrappedMutationHandler(payload) {
    handler.call(store, local.state, payload);
  });
}

function registerAction(store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = []);
  entry.push(function wrappedActionHandler(payload, cb) {
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state,
      },
      payload,
      cb
    );
    if (!isPromise(res)) {
      res = Promise.resolve(res);
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err);
        throw err;
      });
    } else {
      return res;
    }
  });
}

function registerGetter(store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`);
    }
    return;
  }
  store._wrappedGetters[type] = function wrappedGetter(store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    );
  };
}
// 使用严格模式
// 利用vm的$watch方法来观察$$state，也就是Store的state，在它被修改的时候进入回调。回调中只有一句话，用assert断言来检测store._committing，当store._committing为false的时候会触发断言，抛出异常。
function enableStrictMode(store) {
  store._vm.$watch(
    function() {
      return this._data.$$state;
    },
    () => {
      if (process.env.NODE_ENV !== 'production') {
        // 检测store中的_committing的值，如果是true代表不是通过mutation的方法修改的
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        );
      }
    },
    { deep: true, sync: true }
  );
}

function getNestedState(state, path) {
  return path.length ? path.reduce((state, key) => state[key], state) : state;
}

function unifyObjectStyle(type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload;
    payload = type;
    type = type.type;
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(
      typeof type === 'string',
      `expects string as the type, but found ${typeof type}.`
    );
  }

  return { type, payload, options };
}

export function install(_Vue) {
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      );
    }
    return;
  }
  Vue = _Vue;
  applyMixin(Vue);
}
