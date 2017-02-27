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
import { Observable, Subject, Scheduler } from 'rxjs'
import { AccountFactorySpec, AccountFactory, Account, AccountDoc } from 'zenypass-account-model'
const cuid = require('cuid')

export interface AccountStreamOperatorsFactory {
  (getAccountFactory: CustomAccountFactoryBuilder,
  opts?: Partial<AccountStreamOperatorsFactorySpec>): AccountStreamOperators
}

export interface CustomAccountFactoryBuilder {
  (onEmit: <T>(doc: Partial<AccountDoc>, ...args: any[]) => T,
  opts?: Partial<AccountFactorySpec>): AccountFactory
}

export interface AccountStreamOperatorsFactorySpec {
  // void
}

export interface AccountStreamOperators {
  newAccount: AccountFactory
  toAccount (doc$: Observable<AccountDoc>): Observable<Account>
  toAccount (doc$: Observable<AccountDoc[]>): Observable<Account[]>
  toAccount (doc$: Observable<AccountDoc[]|AccountDoc>): Observable<Account[]|Account>
  fromAccount (account$: Observable<Account>): Observable<AccountDoc>
  fromAccount (account$: Observable<Account[]>): Observable<AccountDoc[]>
  fromAccount (account$: Observable<Account[]|Account>): Observable<AccountDoc[]|AccountDoc>
}

interface AccountDocEvent {
  uid: string
  doc: AccountDoc
}

class _AccountStreamOperators {
  static getOperators: AccountStreamOperatorsFactory =
  function (getAccountFactory: CustomAccountFactoryBuilder) {
    const promises = {} // resolve function is exchanged over this private object
    function onEmit (doc: AccountDoc, uid: string) {
      const resolve = promises[uid]
      setTimeout(() => resolve(doc))
    }
    const newAccount = getAccountFactory(onEmit, { include_docref: true }) // private factory
    const operators = new _AccountStreamOperators(newAccount, promises)

    return {
      newAccount: getAccountFactory(onEmit), // public factory
      toAccount (doc$: Observable<AccountDoc[]|AccountDoc>) {
        return operators.toAccount(doc$)
      },
      fromAccount (account$: Observable<Account[]|Account>): Observable<AccountDoc[]|AccountDoc> {
        return operators.fromAccount(account$)
      }
    }
  }

  toAccount (doc$: Observable<AccountDoc[]|AccountDoc>) {
    return doc$
    .map(doc => Array.isArray(doc)
    ? doc.map(this.newAccount)
    : this.newAccount(doc))
    .share().observeOn(Scheduler.asap) // isolate subscribers from unhandled errors
  }

  fromAccount (account$: Observable<Account>): Observable<AccountDoc>
  fromAccount (account$: Observable<Account[]|Account>): Observable<AccountDoc[]|AccountDoc> {
    const uid = <string>cuid()

    return account$
    .concatMap<Account,AccountDoc[]|AccountDoc>(account => Array.isArray(account)
    ? this.fromAccount(Observable.from(account)).toArray()
    : new Promise<AccountDoc>(resolve => {
      this.promises[uid] = resolve
      account.emit(uid)
    }))
  }

  private constructor (
    private readonly newAccount: AccountFactory,
    private readonly promises: { [ uid: string ]: (value: AccountDoc) => void }
  ) {}
}

const getOperators: AccountStreamOperatorsFactory =
_AccountStreamOperators.getOperators

export default getOperators