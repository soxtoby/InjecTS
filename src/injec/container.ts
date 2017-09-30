import { flatMap, name } from './utils';
import { IParentLookup, Lookup } from './lookup';
import { Binding, bind } from './binding';
import { IDisposable, Constructor, notDefined, Func, isFunction } from './types';
import { Scope } from './scope';
import { Dependency, getDependencies } from './dependencies';
import { Locals } from './locals';

let maxDependencyDepth = 20;
let resolveChain = <Dependency[]>[];

export interface IParentContainer {
    registeredBindings: IParentLookup<Dependency, Binding<any>>;
    resolve(key: Dependency): any;
}

export class Container implements IParentContainer, IDisposable {
    registeredBindings: Lookup<Dependency, Binding<any>>;
    private scope = new Scope();

    constructor(bindings: Binding<any>[] = [], parentContainer?: IParentContainer) {
        let bindingsPlusBuiltins = bindings
            .concat(bind(Container).toValue(this))
            .map(b => b.bindLifetime(this, this.scope));
        let keyBindingPairs = flatMap(bindingsPlusBuiltins, b => b.keys.map(k => [k, b] as [Dependency, Binding<any>]));
        this.registeredBindings = new Lookup(keyBindingPairs, parentContainer && parentContainer.registeredBindings);

        if (parentContainer)
            parentContainer.resolve(bind().toValue(this).once());
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
            let result = this.defaultBinding(key).build(this, this.scope);
            if (notDefined(result))
                throw new Error(name(key) + " resolved to undefined" + resolveChainMessage());
            return result;
        } finally {
            resolveChain.pop();
        }
    }

    resolveFunction<T>(fn: Func<T>, localKeys: Dependency[] = [], localValues: any[] = []) {
        let self = this;
        return function (this: any, ...args: any[]): T {
            return fn.apply(this, self.resolveDependencies(getDependencies(fn), localKeys || [], localValues || []).concat(args));
        }
    }

    defaultBinding(key: Dependency): Binding<any> {
        if (isBinding(key))
            return key;

        let binding = this.registeredBindings.get(key);
        if (binding)
            return binding;

        if (isFunction(key))
            return this.registeredBindings.add(key, bind(key).toType(key).perContainer());

        throw new Error('Failed to resolve key ' + name(key) + resolveChainMessage());
    }

    resolveDependencies(required: Dependency[], localKeys: Dependency[], localValues: any[]) {
        let locals = new Locals(localKeys, localValues);
        return required.map(dep => locals.get(dep, () => this.resolve(dep)));
    }

    dispose() {
        this.scope.dispose();
    }
}

function isBinding(dep: Dependency): dep is Binding<any> {
    return !!(dep as Binding<any>).build;
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
