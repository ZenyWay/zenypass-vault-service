(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * cuid.js
 * Collision-resistant UID generator for browsers and node.
 * Sequential for fast db lookups and recency sorting.
 * Safe for element IDs and server-side lookups.
 *
 * Extracted from CLCTR
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 */

/*global window, navigator, document, require, process, module */
(function (app) {
  'use strict';
  var namespace = 'cuid',
    c = 0,
    blockSize = 4,
    base = 36,
    discreteValues = Math.pow(base, blockSize),

    pad = function pad(num, size) {
      var s = "000000000" + num;
      return s.substr(s.length-size);
    },

    randomBlock = function randomBlock() {
      return pad((Math.random() *
            discreteValues << 0)
            .toString(base), blockSize);
    },

    safeCounter = function () {
      c = (c < discreteValues) ? c : 0;
      c++; // this is not subliminal
      return c - 1;
    },

    api = function cuid() {
      // Starting with a lowercase letter makes
      // it HTML element ID friendly.
      var letter = 'c', // hard-coded allows for sequential access

        // timestamp
        // warning: this exposes the exact date and time
        // that the uid was created.
        timestamp = (new Date().getTime()).toString(base),

        // Prevent same-machine collisions.
        counter,

        // A few chars to generate distinct ids for different
        // clients (so different computers are far less
        // likely to generate the same id)
        fingerprint = api.fingerprint(),

        // Grab some more chars from Math.random()
        random = randomBlock() + randomBlock();

        counter = pad(safeCounter().toString(base), blockSize);

      return  (letter + timestamp + counter + fingerprint + random);
    };

  api.slug = function slug() {
    var date = new Date().getTime().toString(36),
      counter,
      print = api.fingerprint().slice(0,1) +
        api.fingerprint().slice(-1),
      random = randomBlock().slice(-2);

      counter = safeCounter().toString(36).slice(-4);

    return date.slice(-2) +
      counter + print + random;
  };

  api.globalCount = function globalCount() {
    // We want to cache the results of this
    var cache = (function calc() {
        var i,
          count = 0;

        for (i in window) {
          count++;
        }

        return count;
      }());

    api.globalCount = function () { return cache; };
    return cache;
  };

  api.fingerprint = function browserPrint() {
    return pad((navigator.mimeTypes.length +
      navigator.userAgent.length).toString(36) +
      api.globalCount().toString(36), 4);
  };

  // don't change anything from here down.
  if (app.register) {
    app.register(namespace, api);
  } else if (typeof module !== 'undefined') {
    module.exports = api;
  } else {
    app[namespace] = api;
  }

}(this.applitude || this));

},{}],2:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var src_1=require("../../src"),opgp_service_1=require("opgp-service"),pbkdf2_opgp_key_1=require("pbkdf2-opgp-key"),randombins_1=require("randombins"),randombytes=require("randombytes"),PouchDB=require("pouchdb-browser"),rxjs_1=require("rxjs"),debug=require("debug");debug.enable("zp-vault-example:*");var opgp=opgp_service_1.default(),alphabet="-abcdefghijklmnopqrstuvw_",getRandomBins=randombins_1.default({size:32}),encoder=getRandomBins([alphabet,alphabet]).reduce(function(e,r){return e.concat(r)},[]).then(function(e){return{bins:e,pbkdf2:{encoding:"base64",salt:randombytes(64).toString("base64"),iterations:8192,length:32,hmac:"sha512"}}}),getPbkdf2OpgpKey=pbkdf2_opgp_key_1.default(opgp,{pbkdf2:{salt:64,iterations:8192,length:64}}),key=getPbkdf2OpgpKey("j.doe@example.com","secret passphrase"),db=new PouchDB("accounts"),accounts=src_1.default(db,opgp,key,encoder),account$=rxjs_1.Observable.from([{url:"https://zenyway.com"},{url:"https://en.wikipedia.org/w/index.php?title=Special:UserLogin"}]).map(function(e){return accounts.newAccount(e)}).do(debug("zp-vault-example:account:")).share().observeOn(rxjs_1.Scheduler.asap),ref$=account$.let(accounts.write).do(debug("zp-vault-example:write:")).map(function(e){return{_id:e._id}}).do(debug("zp-vault-example:ref:")).share().observeOn(rxjs_1.Scheduler.asap);ref$.let(accounts.read).forEach(debug("zp-vault-example:read:")).then(debug("zp-vault-example:read:done:")).catch(debug("zp-vault-example:read:error:")).then(function(){return db.destroy()}).then(debug("zp-vault-example:db-destroy:done")).catch(debug("zp-vault-example:db-destroy:error:"));
},{"../../src":4,"debug":undefined,"opgp-service":undefined,"pbkdf2-opgp-key":undefined,"pouchdb-browser":undefined,"randombins":undefined,"randombytes":undefined,"rxjs":undefined}],3:[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var rxjs_1=require("rxjs"),cuid=require("cuid"),_AccountStreamOperators=function(){function r(r,t){this.newAccount=r,this.promises=t}return r.prototype.toAccount=function(r){var t=this;return r.map(function(r){return Array.isArray(r)?r.map(t.newAccount):t.newAccount(r)}).share().observeOn(rxjs_1.Scheduler.asap)},r.prototype.fromAccount=function(r){var t=this,e=cuid();return r.concatMap(function(r){return Array.isArray(r)?t.fromAccount(rxjs_1.Observable.from(r)).toArray():new Promise(function(o){t.promises[e]=o,r.emit(e)})})},r}();_AccountStreamOperators.getOperators=function(r){function t(r,t){var o=e[t];setTimeout(function(){return o(r)})}var e={},o=r(t,{include_docref:!0}),n=new _AccountStreamOperators(o,e);return{newAccount:r(t),toAccount:function(r){return n.toAccount(r)},fromAccount:function(r){return n.fromAccount(r)}}};var getOperators=_AccountStreamOperators.getOperators;exports.default=getOperators;
},{"cuid":1,"rxjs":undefined}],4:[function(require,module,exports){
"use strict";function getVault(t,e,r,n){function o(t){return u(t).then(function(t){return t.value})}var u=pbkdf2sha512_1.default(n.pbkdf2);return cbox_vault_1.default(t,e,getKeyRing(r),{hash:o,bins:n.bins,read:{include_docs:!0}})}function getKeyRing(t){return{auth:t.key,cipher:t.key}}Object.defineProperty(exports,"__esModule",{value:!0});var account_stream_operators_1=require("./account-stream-operators"),pbkdf2sha512_1=require("pbkdf2sha512"),cbox_vault_1=require("cbox-vault"),zenypass_account_model_1=require("zenypass-account-model"),rxjs_1=require("rxjs"),tslib_1=require("tslib"),VAULT_SERVICE_SPEC_DEFAULTS={getAccountFactory:zenypass_account_model_1.default},_VaultService=function(){function t(t,e,r){this.vault=t,this.newAccount=e,this.operators=r}return t.prototype.write=function(t){var e=this.operators.fromAccount(rxjs_1.Observable.from(t)),r=rxjs_1.Observable.from(this.vault).concatMap(function(t){return t.write(e)}),n=this.operators.toAccount(r);return n},t.prototype.read=function(t,e){var r=rxjs_1.Observable.from(this.vault).concatMap(function(e){return e.read(t)}),n=this.operators.toAccount(r);return n},t.prototype.unlock=function(e){var r=Promise.all([this.vault,e]).then(function(t){var e=t[0],r=t[1];return e.unlock(getKeyRing(r))});return new t(r,this.newAccount,this.operators)},t.prototype.toVaultService=function(){var t=this;return{newAccount:t.newAccount.bind(t),write:t.write.bind(t),read:t.read.bind(t),unlock:function(e){return t.unlock(e).toVaultService()}}},t}();_VaultService.getInstance=function(t,e,r,n,o){function u(t){return s.then(function(e){return e.unlock(t)}).then(Boolean)}var c=tslib_1.__assign({},VAULT_SERVICE_SPEC_DEFAULTS,o),a=Promise.resolve(r),i=Promise.all([a,n]).then(function(r){var n=r[0],o=r[1];return c["cbox-vault"]||getVault(t,e,n,o)}),s=a.then(function(t){return t.clone()}),l=c.getAccountFactory.bind(void 0,u),_=account_stream_operators_1.default(l);return new _VaultService(i,_.newAccount,_).toVaultService()};var getVaultService=_VaultService.getInstance;exports.default=getVaultService;
},{"./account-stream-operators":3,"cbox-vault":undefined,"pbkdf2sha512":undefined,"rxjs":undefined,"tslib":undefined,"zenypass-account-model":undefined}]},{},[2]);
