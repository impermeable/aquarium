mkdir out/out
cp vendor/* out/out
mv out/out/wacoq_worker.js out/
mkdir out/node_modules/@ocaml-wasm/4.12--janestreet-base/bin -p
cp node_modules/@ocaml-wasm/4.12--janestreet-base/bin/* out/node_modules/@ocaml-wasm/4.12--janestreet-base/bin
mkdir out/node_modules/@ocaml-wasm/4.12--zarith/bin -p
cp node_modules/@ocaml-wasm/4.12--zarith/bin/* out/node_modules/@ocaml-wasm/4.12--zarith/bin
mkdir out/node_modules/ocaml-wasm/bin -p
cp node_modules/ocaml-wasm/bin/* out/node_modules/ocaml-wasm/bin