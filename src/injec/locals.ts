import { Dependency } from './dependencies';

export class Locals {
    keys: Dependency[];
    values: any[];

    constructor(keys: Dependency[], values: any[]) {
        this.keys = keys.slice();    // Don't want to modify someone else's arrays
        this.values = values.slice();
    }

    get(key: Dependency, fallback: (key: Dependency) => any) {
        let i = this.keys.indexOf(key);
        return key == Locals ? this
            : i < 0 ? fallback(key)
            : (this.keys.splice(i, 1), this.values.splice(i, 1)[0]);
    }
}
