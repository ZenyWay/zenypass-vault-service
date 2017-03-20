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
import getAccountStreamOperators, { AccountStreamOperators } from './account-stream-operators'
import { isFunction } from './utils'
import { OpgpService, Eventual } from 'opgp-service'
import { Pbkdf2OpgpKey } from 'pbkdf2-opgp-key'
import getPbkdf2Sha512, { Pbkdf2sha512Digest, Pbkdf2sha512DigestSpec } from 'pbkdf2sha512'
import getCboxVault, {
  CboxVaultSpec, CboxVault, Streamable, OneOrMore, KeyRing,
  DocId, DocRef, DocIdRange, ReadOpts
} from 'cbox-vault'
import getAccountFactory, {
  AccountFactoryBuilder, AccountFactory, Account, AccountObject, AccountDoc
} from 'zenypass-account-model'
import { Observable } from 'rxjs'
import { __assign as assign } from 'tslib'

export {
  AccountFactory, Account, AccountObject,
  DocRef, DocId, DocIdRange, ReadOpts
}

export interface ZenypassVaultServiceFactory {
  (db: any, opgp: OpgpService, key: Eventual<Pbkdf2OpgpKey>,
  opts?: Partial<ZenypassVaultServiceSpec>):  ZenypassVaultService
}

export interface IdEncoderSpec {
  pbkdf2: Pbkdf2sha512DigestSpec,
  bins: string[]
}

export interface ZenypassVaultServiceSpec {
  getAccountFactory: AccountFactoryBuilder
  vault: CboxVault
  encoder: Eventual<IdEncoderSpec>
}

export interface ZenypassVaultService {
  newAccount: AccountFactory
  /**
   * @public
   * @method
   *
   * @description
   * rx operator that stores the documents from an input sequence to
   * the underlying (cbox-vault)[https://www.npmjs.com/package/cbox-vault] instance,
   * and maps that input sequence to a corresponding sequence of
   * resulting {DocRef} references.
   *
   * @param {Observable<ZenypassDoc[]|ZenypassDoc>} doc$
   * a sequence of instances or arrays of {ZenypassDoc} versioned documents.
   *
   * @return {Observable<DocRef[]|DocRef>}
   * sequence of resulting {DocRef} references after storage.
   * when the input `doc$` sequence emits an array of documents,
   * the output sequence emits a resulting array of {DocRef} references,
   * in the same order.
   *
   * @error {Error} when storing a document fails,
   * e.g. when the underlying key is locked.
   * // TODO provide more detail on possible storage errors
   *
   * @memberOf ZenypassVaultService
   */
  write (accounts: Streamable<Account>): Observable<Account>
  write (accounts: Streamable<Account[]>): Observable<Account[]>
  write (accounts: Streamable<OneOrMore<Account>>): Observable<OneOrMore<Account>>

  /**
   * @public
   * @method
   *
   * @description
   * rx operator that maps a sequence of document references
   * to the corresponding documents fetched from
   * the underlying (cbox-vault)[https://www.npmjs.com/package/cbox-vault] instance.
   * the input document reference sequence may alternatively emit
   * any of the following:
   * * individual {DocRef} or {DocId} references,
   * * arrays of {DocRef} or {DocId} references,
   * * {DocIdRange} ranges of document references,
   * * {DocRevs} sets of references to document revisions.
   *
   * @param {Observable<DocRef[]|DocIdRange|DocRevs|DocRef>} ref$
   * a sequence of document references.
   *
   * @return {Observable<ZenypassDoc[]|ZenypassDoc|(ZenypassDoc&DocRevStatus)>}
   * the referenced {ZenypassDoc} document(s)
   * with all of its content ~~excluding the `restricted` entry~~,
   * or only the corresponding {ZenypassDoc} stubbed references,
   * retrieved from the underlying
   * (cbox-vault)[https://www.npmjs.com/package/cbox-vault] instance.
   * when the input `refs` sequence emits
   * an array of {DocRef} or {DocId} references,
   * a {DocIdRange} range of document references,
   * or a {DocRevs} set of references to document revisions,
   * the output sequence emits a resulting array
   * of {ZenypassDoc} documents or {DocRef} references,
   * in the order of the input array of references,
   * or else as specified by the {DocIdRange} range.
   *
   * @error {Error} when retrieving a document fails
   * e.g. when the underlying key is locked.
   * // TODO provide more detail on possible fetch errors
   *
   * @memberOf ZenypassVaultService
   */
  read (refs: Streamable<DocRef>, opts?: ReadOpts): Observable<Account>
  read (refs: Streamable<DocRef[]>, opts?: ReadOpts): Observable<Account[]>
  read (refs: Streamable<DocIdRange>, opts?: ReadOpts): Observable<Account[]>
  read (refs: Streamable<OneOrMore<DocRef>|DocIdRange>, opts?: ReadOpts):
  Observable<OneOrMore<Account>>
  unlock(key: Pbkdf2OpgpKey): ZenypassVaultService
}

const VAULT_SERVICE_SPEC_DEFAULTS = {
  getAccountFactory: getAccountFactory
}


class _VaultService {
  static getInstance: ZenypassVaultServiceFactory =
  function (db: any, opgp: OpgpService, key: Eventual<Pbkdf2OpgpKey>,
  opts?: Partial<ZenypassVaultServiceSpec>) {
    const spec: ZenypassVaultServiceSpec = assign({}, VAULT_SERVICE_SPEC_DEFAULTS, opts)

    const pbkdf2key = Promise.resolve(key)
    const vault = spec.vault
    ? Promise.resolve(spec.vault)
    : Promise.all([ pbkdf2key, spec.encoder ])
    .then(([ key, encoder ]) => getVault(db, opgp, key, encoder))

    const authkey = pbkdf2key.then(key => key.clone()) // locked
    function authorize (passphrase: string): Promise<boolean> {
      return authkey.then(key => key.unlock(passphrase)).then(Boolean)
    }
    const getCustomAccountFactory = spec.getAccountFactory.bind(void 0, authorize)
    const operators = getAccountStreamOperators(getCustomAccountFactory)

    return new _VaultService(vault, operators.newAccount, operators)
    .toVaultService()
  }

  write (accounts: Streamable<OneOrMore<Account>>) {
    const doc$: Observable<OneOrMore<AccountDoc>> =
    this.operators.fromAccount(Observable.from(accounts))

    const accountdoc$: Observable<OneOrMore<AccountDoc>> =
    Observable.from(this.vault)
    .concatMap(vault =>
      vault.write<AccountDoc>(doc$))

    const account$: Observable<OneOrMore<Account>> =
    this.operators.toAccount(accountdoc$)

    return account$
  }

  read (refs: Streamable<OneOrMore<DocRef>|DocIdRange>, opts?: ReadOpts) {
    const doc$ = Observable.from(this.vault)
    .concatMap(vault => vault.read<AccountDoc>(refs))

    const account$: Observable<OneOrMore<Account>> =
    this.operators.toAccount(doc$)

    return account$
  }

  unlock (key: Eventual<Pbkdf2OpgpKey>): _VaultService {
    const vault = Promise.all([ this.vault, key ])
    .then(([ vault, key ]) => vault.unlock(getKeyRing(key)))
    return new _VaultService(vault, this.newAccount, this.operators)
  }

  private constructor (
    private readonly vault: Promise<CboxVault>,
    private readonly newAccount: AccountFactory,
    private readonly operators: AccountStreamOperators
  ) {}

  private toVaultService (): ZenypassVaultService {
    const self = this
    return {
      newAccount: self.newAccount.bind(self),
      write: self.write.bind(self),
      read: self.read.bind(self),
      unlock (key: Pbkdf2OpgpKey): ZenypassVaultService {
        return self.unlock(key).toVaultService()
      }
    }
  }
}

function getVault (db: any, opgp: OpgpService, key: Pbkdf2OpgpKey,
encoder?: IdEncoderSpec): CboxVault {
  const opts: Partial<CboxVaultSpec> = { read: { include_docs: true } }

  if (encoder) {
    const pbkdf2 = getPbkdf2Sha512(encoder.pbkdf2)
    opts.hash = getHash(pbkdf2)
    opts.bins = encoder.bins
  }

  return getCboxVault(db, opgp, getKeyRing(key), opts)
}

interface Digest {
  (password: string | Buffer | Uint8Array): Promise<Pbkdf2sha512Digest>
}

function getHash (pbkdf2: Digest) {
  return function hash (id: string): Promise<Uint8Array|string> {
    return pbkdf2(id).then(digest => digest.value)
  }
}

function getKeyRing (key: Pbkdf2OpgpKey): KeyRing {
  return {
    auth: key.key,
    cipher: key.key
  }
}

const getVaultService: ZenypassVaultServiceFactory = _VaultService.getInstance
export default getVaultService
