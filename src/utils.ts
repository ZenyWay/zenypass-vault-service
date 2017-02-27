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
export function isString (val: any): val is string|String {
  return typeof (val && val.valueOf()) === 'string'
}

export function isBoolean (val: any): val is boolean|Boolean {
  return typeof (val && val.valueOf()) === 'boolean'
}

export function isFunction (val: any): val is Function {
  return typeof val === 'function'
}
