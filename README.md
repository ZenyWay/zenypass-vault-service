# zenypass-vault-service [![Join the chat at https://gitter.im/ZenyWay/zenypass-vault-service](https://badges.gitter.im/ZenyWay/zenypass-vault-service.svg)](https://gitter.im/ZenyWay/zenypass-vault-service?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![NPM](https://nodei.co/npm/zenypass-vault-service.png?compact=true)](https://nodei.co/npm/zenypass-vault-service/)
[![build status](https://travis-ci.org/ZenyWay/zenypass-vault-service.svg?branch=master)](https://travis-ci.org/ZenyWay/zenypass-vault-service)
[![coverage status](https://coveralls.io/repos/github/ZenyWay/zenypass-vault-service/badge.svg?branch=master)](https://coveralls.io/github/ZenyWay/zenypass-vault-service)
[![Dependency Status](https://gemnasium.com/badges/github.com/ZenyWay/zenypass-vault-service.svg)](https://gemnasium.com/github.com/ZenyWay/zenypass-vault-service)

[cbox-vault](https://www.npmjs.com/package/cbox-vault/)
that encrypt-writes/read-decrypts
[Account](https://www.npmjs.com/package/zenypass-account-model/) instances.
exposes an [Account](https://www.npmjs.com/package/zenypass-account-model/) factory.

# <a name="example"></a> example
```ts
import getVaultService, { Account, AccountObject, DocRef, IdEncoderSpec } from 'zenypass-vault-service'
import getOpgpService from 'opgp-service'
import getPbkdf2OpgpKeyFactory from 'pbkdf2-opgp-key'
import getRandomBinsFactory from 'randombins'
const randombytes = require('randombytes')
const PouchDB = require('pouchdb-browser')
import { Observable, Scheduler } from 'rxjs'
import debug = require('debug')
debug.enable('zp-vault-example:*')

const opgp = getOpgpService()

// setup id encoder specifications (optional)
const alphabet = '-abcdefghijklmnopqrstuvw_'
const getRandomBins = getRandomBinsFactory({ size: 32 })
const encoder: Promise<IdEncoderSpec> = getRandomBins([ alphabet, alphabet ])
.reduce<string[]>((arr, bin) => arr.concat(bin), [])
.then(bins => ({
  bins: bins,
  pbkdf2: { // pbkdf2 parameters for id encoder
    encoding: 'base64',
    salt: <string>randombytes(64).toString('base64'),
    iterations: 8192, // min 8192
    length: 32, // min 32, max 64
    hmac: <'sha512'>'sha512' // always 'sha512'
  }
}))

// setup pbkdf2-protected PGP key pair
const getPbkdf2OpgpKey = getPbkdf2OpgpKeyFactory(opgp, {
  // keysize: 2048, locked: false (defaults)
  pbkdf2: {
    salt: 64, // generate random 64-byte long string, encoding: base64 (default)
    iterations: 8192, // min 8192, default 65536
    length: 64 // min 32, max 64, default 64
    // digest is always 'sha512'
  }
})
const key = getPbkdf2OpgpKey('j.doe@example.com', 'secret passphrase')

// setup Zenypass Vault
const db = new PouchDB('accounts')
const accounts = getVaultService(db, opgp, key, { encoder: encoder })

// source sequence of Account instances
const account$ = Observable.from<Partial<AccountObject>>([
  { url: 'https://zenyway.com' },
  { url: 'https://en.wikipedia.org/w/index.php?title=Special:UserLogin' }
])
.map(obj => accounts.newAccount(obj))
.do<Account>(debug('zp-vault-example:account:'))
.share().observeOn(Scheduler.asap) // hot Observable with isolation of subscriptions

// persist source Account sequence to accounts vault
// and extract _id properties of persisted instances
const ref$ = account$
.let(accounts.write)
.do<Account>(debug('zp-vault-example:write:'))
.map<Account,DocRef>(account => ({ _id: account._id }))
.do<DocRef>(debug('zp-vault-example:ref:'))
.share().observeOn(Scheduler.asap)

// read Account sequence from accounts vault
ref$
.let(accounts.read)
.forEach(debug('zp-vault-example:read:'))
.then(debug('zp-vault-example:read:done:'))
.catch(debug('zp-vault-example:read:error:'))
.then(() => db.destroy())
.then(debug('zp-vault-example:db-destroy:done'))
.catch(debug('zp-vault-example:db-destroy:error:'))
```
the files of this example are available [in this repository](./spec/example).

view a [live version of this example in your browser console](https://cdn.rawgit.com/ZenyWay/zenypass-vault-service/v0.2.0/spec/example/index.html),
or clone this repository and run the following commands from a terminal:
```bash
npm install
npm run example
```

# <a name="api"></a> API v0.2 experimental
`ES5` and [`Typescript`](http://www.typescriptlang.org/) compatible.
coded in `Typescript 2`, transpiled to `ES5`.

~~for a detailed specification of the API,
[run the unit tests in your browser](https://cdn.rawgit.com/ZenyWay/zenypass-vault-service/v0.2.0/spec/web/index.html).~~

# <a name="contributing"></a> CONTRIBUTING
see the [contribution guidelines](./CONTRIBUTING.md)

# <a name="license"></a> LICENSE
Copyright 2017 Stéphane M. Catala

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the [License](./LICENSE) for the specific language governing permissions and
Limitations under the License.
