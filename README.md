# Aquarium - Online Waterproof Playground

## Vendored files
The code in the `vendor` subdirectory is licensed under the LGPL license.

Files in this directory are produced as part of the [rocq-lsp](https://github.com/rocq-community/rocq-lsp) project and vendored here.

## Before building

This project requires vendored files and WebAssembly binaries to be present in the `out` directory before it can run properly.

After installing dependencies (`npm ci` or `npm i`) and building once (`npm run build`), you can use the included `prepare_out.sh` script to automatically copy the required files from `node_modules` and the `vendor` directory into the `out` folder.

Alternatively, you can copy these files manually, making sure to take the following directory structure in the `out` directory into account:
```text
out/
├── node_modules/
│   ├── @ocaml-wasm/
│   │   ├── 4.12--janestreet-base/
│   │   │   └── bin/
│   │   └── 4.12--zarith/
│   │       └── bin/
│   └── ocaml-wasm/
│       └── bin/
├── out/
```

That is, the WebAssembly binaries from the `@ocaml-wasm/4.12--janestreet-base`, `@ocaml-wasm/4.12--zarith` and `ocaml-wasm` packages must be copied to the corresponding `bin` directories in the `out/node_modules` directory. For example, on Unix-like systems, the following commands will do the trick:
```bash
cp -r node_modules/@ocaml-wasm/4.12--janestreet-base/bin/* out/node_modules/@ocaml-wasm/4.12--janestreet-base/bin
cp -r node_modules/@ocaml-wasm/4.12--zarith/bin/* out/node_modules/@ocaml-wasm/4.12--zarith/bin
cp -r node_modules/ocaml-wasm/bin/* out/node_modules/ocaml-wasm/bin
```

Additionally, all vendored files from the `vendor` subdirectory must be copied to the `out` subdirectory of `out`.

## Running Locally

Local changes can quickly be tried out in the browser using the `npm run serve` command.

After running this command, opening [http://localhost:8000](http://localhost:8000) (the port should be displayed in the output of the run command) will show the browser version of Waterproof.

## Credit

A lot of the code responsible for interaction with the LSP client is taken or adapted from [`waterproof-vscode`](https://github.com/impermeable/waterproof-vscode). We refer to that repository for more information on the original code, its authors and development history.
