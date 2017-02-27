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
import { OpgpService, OpgpProxyKey } from 'opgp-service'
import {
  CboxVault, Streamable, OneOrMore, KeyRing,
  VersionedDoc, DocId, DocRef, DocRevs, DocIdRange, DocRevStatus, ReadOpts
} from 'cbox-vault'
import getAccountFactory, {
  AccountFactoryBuilder, AccountFactory, Account, AccountObject, AccountDoc
} from 'zenypass-account-model'
import { Observable } from 'rxjs'
import { __assign as assign } from 'tslib'

export { AccountFactory, Account, AccountObject }

export interface ZenypassVaultServiceFactory {
  (vault: CboxVault, authorize: (passphrase?: string) => Promise<boolean>,
  opts?: Partial<ZenypassVaultServiceSpec>):  ZenypassVaultService
}

export interface ZenypassVaultServiceSpec {
  getAccountFactory: AccountFactoryBuilder
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
  unlock(keys: KeyRing): ZenypassVaultService
}

const VAULT_SERVICE_SPEC_DEFAULTS = {
  getAccountFactory: getAccountFactory
}


class _VaultService {
  static getInstance: ZenypassVaultServiceFactory =
  function (vault: CboxVault, authorize: (passphrase?: string) => Promise<boolean>,
  opts?: Partial<ZenypassVaultServiceSpec>): ZenypassVaultService {
    const spec: ZenypassVaultServiceSpec = assign({}, VAULT_SERVICE_SPEC_DEFAULTS, opts)
    const getCustomAccountFactory = spec.getAccountFactory.bind(void 0, authorize)
    const operators = getAccountStreamOperators(getCustomAccountFactory)

    const accountVault = new _VaultService(vault, operators.newAccount, operators)
    return {
      newAccount: accountVault.newAccount.bind(accountVault),
      write: accountVault.write.bind(accountVault),
      read: accountVault.read.bind(accountVault),
      unlock (keys: KeyRing) {
        return _VaultService.getInstance(vault.unlock(keys), authorize, opts)
      }
    }
  }

  write (accounts: Streamable<OneOrMore<Account>>) {
    const doc$: Observable<OneOrMore<AccountDoc>> =
    this.operators.fromAccount(Observable.from(accounts))

    const account$: Observable<OneOrMore<Account>> =
    this.operators.toAccount(this.vault.write(doc$))

    return account$
  }

  read (refs: Streamable<OneOrMore<DocRef>|DocIdRange>, opts?: ReadOpts) {
    const doc$ = this.vault.read<AccountDoc>(refs)
    const account$: Observable<OneOrMore<Account>> = this.operators.toAccount(doc$)
    return account$
  }

  private constructor (
    readonly vault: CboxVault,
    readonly newAccount: AccountFactory,
    private readonly operators: AccountStreamOperators
  ) {}
}

const getVaultService: ZenypassVaultServiceFactory = _VaultService.getInstance
export default getVaultService
