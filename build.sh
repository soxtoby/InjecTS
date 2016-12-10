#!/bin/sh
tsc --project tsconfig.bundle.json --outFile dist/injec.ts.js
uglifyjs dist/injec.ts.js --output dist/injec.ts.min.js --source-map dist/injec.ts.min.js.map --in-source-map dist/injec.ts.js.map --mangle