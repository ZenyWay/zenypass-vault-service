/*
 * Copyright 2017 Stephane M. Catala
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * Limitations under the License.
 */
;
import getVaultService from '../../src'
import getCboxVault, { DocId, VersionedDoc } from 'cbox-vault'
import getOpgpService, { OpgpKeyOpts } from 'opgp-service'
import getRandomBinsFactory from 'randombins'
const PouchDB = require('pouchdb-browser')
import getPbkdf2OSha512 from 'pbkdf2sha512'
import { Observable } from 'rxjs'
import debug = require('debug')
debug.enable('zp-vault-example:*')

const opgp = getOpgpService()
const pbkdf2 = getPbkdf2OSha512({ iterations: 8192 }) // min iterations

// set up key pair
const passphrase = pbkdf2('secret passphrase')
const keyspec: Promise<OpgpKeyOpts> = passphrase.then(digest => ({
  passphrase: digest.value,
  size: 2048,
  unlocked: true
}))
const key = opgp.generateKey('john.doe@example.com', keyspec)

// define random bins for more efficient startkey/endkey search
// TODO: integrate this into ZenypassVaultService
const alphabet = '-abcdefghijklmnopqrstuvw_'
const getRandomBins = getRandomBinsFactory({ size: 16})
const bins = getRandomBins([ alphabet, alphabet ])
.reduce((arr, bin) => arr.concat(bin), [])

const idHash = getPbkdf2OSha512({ iterations: 8192 })

const db = new PouchDB('zenypass')
const cbox = getCboxVault(db, opgp, { // encrypt and sign with same key-pair
  cipher: key,
  auth: key
}, {
  hash: (passphrase: string) => idHash(passphrase).then(({ value }) => value),
  bins: bins,
  read: { include_docs: true } // required for bulk read
})

function authorize (passphrase: string): Promise<boolean> {
  return keyspec.then(({ passphrase }) => pbkdf2(passphrase)
  .then(digest => digest.value === passphrase)) // optionally reject with Error when unauthorized
}

const vault = getVaultService(cbox, authorize)

Observable.from([
  { url: 'https://zenyway.com' },
  { url: 'https://en.wikipedia.org/w/index.php?title=Special:UserLogin' }
])
.map(obj => vault.newAccount(obj))
.do(debug('zp-vault-example:account:source:'))
.let(vault.write)
.forEach(debug('zp-vault-example:account:persisted:'))
.then(debug('zp-vault-example:account:done:'))
.catch(debug('zp-vault-example:account:error:'))
