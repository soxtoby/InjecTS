/// <reference path="extensions.d.ts" />
let maxDependencyDepth = 20;
let resolveFn = Symbol('inject.resolveFn');
let scopeFn = Symbol('inject.scope'); // Key for current scope
let locals = Symbol('inject.locals');
let resolveChain = <Dependency[]>[];
const dependencyOverrideKey = 'design:dependencyOverrides';

type Dependency = string | symbol | Constructor<any> | Binding<any>;
type Constructor<T> = Function & ({ new (...args: any[]): T } | { prototype: T });
type Locals = { keys: Dependency[], values: any[] };
type Func<T> = (...args: any[]) => T;

export function bind<T>(type: Constructor<T>): Binding<T>
export function bind<T1, T2>(type1: Constructor<T1>, type2: Constructor<T2>): Binding<T1 & T2>
export function bind<T1, T2, T3>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>): Binding<T1 & T2 & T3>
export function bind<T1, T2, T3, T4>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>, type4: Constructor<T4>): Binding<T1 & T2 & T3 & T4>
export function bind<T>(...names: (string | symbol)[]): Binding<T>
export function bind(...keys: Dependency[]) {
    return Binding.from(keys);
}

interface IFunctionBinding<TFunc extends TResult, TResult> extends Binding<TFunc> {
    toFunction(fn: Func<TResult>): this;
}

export const Injectable: ClassDecorator = (target: Function) => target;

export interface ConstructorParameterDecorator {
    (target: Function, propertyKey: undefined, parameterIndex: number): void;
}

export function Named(name: string | symbol): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Named is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = name;
    };
}

export function Optional<T>(ctor: Constructor<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(binding: Binding<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: string | symbol, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: Dependency, defaultValue?: T): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Optional is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = bind().to(c => c.registeredBindings.get(key) ? c.resolve(key) : defaultValue);
    };
}

export function All<T>(key: Dependency): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Optional is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = bind().to(c => c.registeredBindings.getAll(key).map(b => c.resolve(b)));
    };
}

function dependencyOverrides(ctor: Function): Dependency[] {
    let overrides: Dependency[] = Reflect.getMetadata(dependencyOverrideKey, ctor);
    if (!overrides)
        Reflect.defineMetadata(dependencyOverrideKey, overrides = [], ctor);
    return overrides;;
}

export function Dependant(...dependencies: Dependency[]) {
    return function <T extends Function>(target: T) {
        Reflect.defineMetadata('design:paramtypes', dependencies, target);
        return target;
    }

}

export function fallback(fallbackFn: (key: Dependency) => any, parentContainer?: IParentContainer) {
    let fallbackResolve = new Container();
    parentContainer = parentContainer || { registeredBindings: new Lookup<Dependency, Binding<any>>(), resolve() { } };
    fallbackResolve.registeredBindings.getAll = function (key) {
        let value = fallbackFn(key);
        return parentContainer!.registeredBindings.getAll(key)
            .concat(isDefined(value) ? [bind().toValue(value)] : []);
    };
    return fallbackResolve;
}

interface IParentContainer {
    registeredBindings: Lookup<Dependency, Binding<any>>;
    resolve(key: Dependency): any;
}

class Container implements IParentContainer {
    registeredBindings: Lookup<Dependency, Binding<any>>;
    scope = new Scope();

    constructor(bindings: Binding<any>[] = [], parentContainer?: IParentContainer) {
        let bindingsPlusBuiltins = bindings
            .concat(bind(resolveFn).toValue(this), bind(scopeFn).toValue(this.scope))
            .map(b => b.bindLifetime(this, this.scope));
        let keyBindingPairs = flatMap(bindingsPlusBuiltins, b => b.keys.map(k => [k, b] as [Dependency, Binding<any>]));
        this.registeredBindings = new Lookup(keyBindingPairs, parentContainer && parentContainer.registeredBindings);

        if (parentContainer)
            parentContainer.resolve(bind().toValue(this));
    }

    resolve<T>(ctor: Constructor<T>): T
    resolve<T>(binding: Binding<T>): T
    resolve<T>(key: string | symbol): T
    resolve(key: Dependency): any
    resolve(key: Dependency): any {
        if (!key)
            throw new Error("Tried to resolve " + name(key));

        if (resolveChain.length == maxDependencyDepth)
            throw new Error("Maximum dependency depth of " + maxDependencyDepth + " reached" + resolveChainMessage());

        resolveChain.push(key);
        try {
            return this.defaultBinding(key).build(this, this.scope);
        } finally {
            resolveChain.pop();
        }
    }

    resolveFunction<T>(fn: Func<T>, localKeys: Dependency[] = [], localValues: any[] = []) {
        let self = this;
        return function (...args: any[]): T {
            return fn.apply(this, self.resolveDependencies(dependencyKeys(fn), localKeys || [], localValues || []).concat(args));
        }
    }

    defaultBinding(key: Dependency) {
        let binding = this.registeredBindings.get(key);

        if (binding)
            return binding;
        if (isFunction(key)) {
            if (key.isDependantFn)
                return bind().toFunction(key as Func<any>).perDependency();
            if (key.isFactory)
                return bind().to(c => c.resolveFunction(key as Func<any>)()).perDependency();
            return this.registeredBindings.add(key, bind(key).toType(key).perContainer());
        }
        throw new Error('Failed to resolve key ' + name(key) + resolveChainMessage());
    }

    resolveDependencies(required: Dependency[], localKeys: Dependency[], localValues: any[]) {
        let localLookup = newLocalLookup(localKeys, localValues);
        return required.map(dep => localLookup(dep, () => this.resolve(dep)));
    }
}

class Binding<T> implements Binding<T> {
    private constructor(
        private _keys: Dependency[],
        private _factory: Func<T>,
        private _lifeTime: (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => T) {
        this.perContainer();
    }

    static from(keys: Dependency[]) {
        return new Binding(keys, () => { throw new Error("No factory for binding") }, (f, rr, rs, r, s) => { throw new Error() })
            .perContainer();
    }

    get keys() { return this._keys; }

    to(factory: (container: Container) => T) {
        return new Binding<T>(this._keys, factory, this._lifeTime);
    }

    toType(type: Constructor<T>) {
        return this.to(constructor(type))
    }

    toValue(value: T) {
        return this.to(c => value);
    }

    toFunction(fn: Func<any>) {
        return this.to(c => {
            let local: Locals = c.resolve<Locals>(locals);
            return <T><any>c.resolveFunction<any>(fn, local.keys, local.values);
        });
    }

    once(): Binding<T> {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => {
            return registeredScope.get(this, registeredResolve.resolveFunction(factory));
        });
    }

    perContainer(): Binding<T> {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => {
            return currentScope.get(this, resolve.resolveFunction(factory));
        });
    }

    perDependency() {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => {
            return currentScope.get(null, resolve.resolveFunction(factory));
        });
    }
    
    bindLifetime(boundContainer: Container, boundScope: Scope) {
        let innerLifetime = this._lifeTime;
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => {
            return innerLifetime(factory, boundContainer, boundScope, resolve, currentScope);
        });
    }

    then(callback: (value: T) => void) {
        return this.to(c => {
            let value = this._factory(c);
            callback(value);
            return value;
        });
    }

    useParameterHook(hook: (container: Container, key: Dependency) => any) {
        let innerFactory = this._factory;
        return this.to(c => {
            let local = c.resolve(locals) as Locals;
            let originalKeys = dependencyKeys(innerFactory);
            let hookedKeys = originalKeys.map(key => {
                let hookValue = hook(c, key);
                return isDefined(hookValue)
                    ? constant(hookValue)
                    : key;
            });

            return c.resolveFunction(dependant(hookedKeys, (...args: any[]) => innerFactory(...args)), local.keys, local.values)();
        });
    }

    withDependency<T>(key: Constructor<T>, value: T): this
    withDependency(key: string | symbol, value: any): this
    withDependency(key: Dependency, value: any) {
        verifyType(key, value);

        return this.useParameterHook((resolve: Container, paramKey: Dependency) => {
            if (paramKey === key) return value;
        });
    }

    withArguments(args: any[]) {
        let innerFactory = this._factory;
        this._factory = dependant(
            dependencyKeys(innerFactory).slice(args.length),
            (...rest: any[]) => innerFactory(...args, ...rest));
        return this;
    }

    build(container: Container, scope: Scope) {
        return this._lifeTime(this._factory, container, scope, container, scope);
    }
}

function resolveChainMessage() {
    return resolveChain.length > 1
        ? " while attempting to resolve "
        + resolveChain
            .slice(0, -1)
            .map(name)
            .join(' -> ')
        : '';
}

function dependencyKeys(ctor: any): Dependency[] { // TODO typing
    return ctor.dependencies || [];
}

function name(key: Dependency) {
    return isFunction(key)
        ? key.name || "Type"
        : "'" + String(key) + "'";
}

class Scope {
    private lookup = new Lookup<Binding<any> | null, any>();

    get<T>(key: Binding<T> | null, resolveForKey: () => any) {
        let value = key ? this.lookup.get(key) : undefined;
        if (value == undefined) {
            value = resolveForKey();
            return key || isDisposable(value)
                ? this.lookup.add(key, this.disposable(key, value))
                : value
        }
    }

    private disposable<T>(key: Binding<T> | null, value: any) {
        if (isDisposable(value))
            value.dispose = () => {
                value.dispose();
                this.lookup.remove(key, value);
            };
        return value;
    }

    dispose() {
        this.lookup.values()
            .filter(isDisposable)
            .forEach(value => value.dispose());
    }
}

function isDisposable(value: any): value is IDisposable {
    return value
        && isFunction(value.disposable);
}

interface IDisposable {
    dispose(): void;
}

function newLocalLookup(keys: Dependency[], values: any[]) {
    return function localLookup(key: Dependency, fallback: (key: Dependency) => any) {
        let i = keys.indexOf(key);
        keys = keys.slice();    // Don't want to modify someone else's arrays
        values = values.slice();
        return key == locals ? { keys: keys, values: values }
            : i < 0 ? fallback(key)
            : (keys.splice(i, 1), values.splice(i, 1)[0]);
    };
}

class Lookup<TKey, TValue> {
    private parent: { get(key: TKey): TValue | undefined; getAll(key: TKey): TValue[] };
    private map = new Map<TKey, TValue[]>();

    constructor(initialEntries: [TKey, TValue][] = [], parent?: Lookup<TKey, TValue>) {
        this.parent = parent || { get(key: TKey) { return undefined; }, getAll(key: TKey) { return []; } };
        initialEntries.forEach(([key, value]) => this.add(key, value));
    }

    add(key: TKey, value: TValue) {
        let values = this.map.get(key);
        if (values == null)
            this.map.set(key, values = []);
        values.push(value);
        return value;
    }

    remove(key: TKey, value: TValue) {
        let values = this.map.get(key) || [];
        let i = values.indexOf(value);
        if (i >= 0)
            values.splice(i, 1);
    }

    get(key: TKey): TValue | undefined {
        let values = key ? this.map.get(key) : null;
        return values != null
            ? last(values)
            : this.parent.get(key);
    }

    getAll(key: TKey): TValue[] {
        return this.parent.getAll(key).concat(this.map.get(key) || []);
    }

    values() {
        return flatMap(Array.from(this.map.values()), vs => vs);
    }
}

function makeFactory<T>(type: Constructor<T>, funcDependencies?: Dependency[]): Binding<Func<T>>;
function makeFactory<T>(name: (string | symbol), funcDependencies?: Dependency[]): Binding<Func<T>>;
function makeFactory<T>(key: Dependency, funcDependencies: Dependency[] = []): Binding<Func<T>> {
    return Binding.from([key]).to(c => {
        return (...args: any[]) => {
             c.resolveFunction(key, funcDependencies, args);
        }
    });    
}

function verifyType(key: Dependency, value: any) {
    if (notDefined(value))
        throw new Error(name(key) + " resolved to undefined" + resolveChainMessage());
    if (value === null)
        return value;
    if (isConstructor(key) && !(value instanceof key))
        throw new Error('Value does not inherit from ' + name(key));
    return value;
}

function verifyIsFunction(fn: any, name: string) {
    if (!isFunction(fn))
        throw new Error(name + " is not a function");
}

function verifyArity(dependencies: Dependency[], fn: Function) {
    if (dependencies.length != fn.length) {
        let dependenciesMsg = dependencies.length == 1 ? "1 dependency" : dependencies.length + " dependencies",
            paramsMsg = fn.length == 1 ? "1 parameter" : fn.length + " parameters";
        throw new Error(name(fn) + " has " + dependenciesMsg + ", but " + paramsMsg);
    }
}

function defaultArg<T>(arg: T | undefined, defaultValue: T) {
    return notDefined(arg)
        ? defaultValue
        : arg;
}

function constant<T>(value: T) {
    return factory(named([value], function () {
        return value;
    }));
}

function constructor<T>(fn: Constructor<T>): Func<T> {
    return c => c.resolveFunction(Dependant(...dependencyKeys(fn))((...args: any[]) => Reflect.construct(fn, args)))();
}

function factory<T extends Function>(fn: T) {
    return Object.assign(fn, { isFactory: true });
}

function dependant<T extends Function>(dependencies: Dependency[], fn: T) {
    if (dependencies.some(notDefined))
        throw new Error(name(fn) + " has an undefined dependency");

    return Object.assign(fn, { dependencies: dependencies, isDependantFn: true });
}

function chain<TThis>(fn: (this: TThis) => any): () => TThis;
function chain<TThis, T1>(fn: (this: TThis, arg1: T1) => any): (arg1: T1) => TThis;
function chain<TThis, T1, T2>(fn: (this: TThis, arg1: T1, arg2: T2) => any): (arg1: T1, arg2: T2) => TThis;
function chain(fn: (...args: any[]) => any) {
    return function (...args: any[]) {
        fn.apply(this, args);
        return this;
    }
}

function repeat<T>(value: T, times: number): T[] {
    let array = <T[]>[];
    while (times--)
        array.push(value);
    return array;
}

function flatMap<TIn, TOut>(array: TIn[], mapFn: (item: TIn) => TOut[]): TOut[] {
    return Array.prototype.concat.apply([], array.map(mapFn));
}

function last<T>(array: T[]): T {
    return array[array.length - 1];
}

function named<T extends Function>(parts: any[], fn: T) {
    fn.displayName = parts.map(argName).join('');
    return fn;
}

function argName(value: any) {
    return isFunction(value)
        ? value.displayName
            ? value.displayName
            : value.name || 'anonymous function'
        : value
}

function isConstructor(fn: any): fn is Function {
    return isFunction(fn)
        && !fn.isFactory
        && !fn.isDependantFn;
}

function isFunction(fn: any): fn is Function {
    return typeof fn == 'function';
}

function notDefined(value: any): value is undefined {
    return !isDefined(value);
}

function isDefined(value: any) {
    return typeof value != 'undefined';
}
