import "reflect-metadata";
import { notDefined } from './types';
import { Binding, BindableKey } from './binding';
import { name } from './utils';

const dependenciesKey = 'design:dependencies`';

export type Dependency = BindableKey | Binding<any>;

export function ctor(dependencies: Dependency[], fn: Function) {
    if (dependencies.length != fn.length) {
        var dependenciesMsg = dependencies.length == 1 ? "1 dependency" : dependencies.length + " dependencies",
            paramsMsg = fn.length == 1 ? "1 parameter" : fn.length + " parameters";
        throw new Error(name(fn) + " has " + dependenciesMsg + ", but " + paramsMsg);
    }
    return dependant(dependencies, fn);
}

export function dependant<T extends Function>(dependencies: Dependency[], fn: T) {
    if (dependencies.some(notDefined))
        throw new Error(name(fn) + " has an undefined dependency");

    getDependencies(fn).splice(0, Number.MAX_VALUE, ...dependencies);
    return fn;
}

export function getDependencies(ctor: Function): Dependency[] {
    let dependencies: Dependency[] = Reflect.getMetadata(dependenciesKey, ctor);
    if (!dependencies)
        Reflect.defineMetadata(dependenciesKey, dependencies = [], ctor);
    return dependencies;
}
