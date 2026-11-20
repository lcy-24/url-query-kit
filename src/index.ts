/**
 * url-query-kit
 * URL query 解析与序列化：数组/对象、重复键、类型保留、加解密友好，零依赖、全 TypeScript。
 *
 * 从 SaaS 平台的列表筛选、分页参数、分享链接场景提炼。
 * 三个高频坑：
 *  1. 手写 `?a=1&b=2` 拼接会漏 encodeURIComponent → 中文/特殊字符出错
 *  2. 重复键（a=1&a=2）要转数组，但单个值别包成数组
 *  3. 解析出的值默认是字符串，数字/布尔类型会丢
 */

export interface ParsedObject {
  [key: string]: ParsedValue
}

export type ParsedValue = string | number | boolean | null | ParsedValue[] | ParsedObject

export interface ParseOptions {
  /** 是否自动推断类型（'1' → 1, 'true' → true, 'null' → null），默认 true */
  autoType?: boolean
  /** 空字符串是否转成 null，默认 true */
  emptyToNull?: boolean
  /** 数组的序列化格式，默认 'repeat'（a=1&a=2），可选 'bracket'（a[]=1&a[]=2） */
  arrayFormat?: 'repeat' | 'bracket'
}

function decodeValue(raw: string, options: ParseOptions): ParsedValue {
  const decoded = decodeURIComponent(raw)
  if (options.emptyToNull !== false && decoded === '') return null
  if (options.autoType !== false) {
    if (decoded === 'true') return true
    if (decoded === 'false') return false
    if (decoded === 'null') return null
    if (decoded === 'undefined') return null
    if (/^-?\d+(\.\d+)?$/.test(decoded) && !/^0\d/.test(decoded) && decoded.length < 16) {
      return Number(decoded)
    }
  }
  return decoded
}

/**
 * 解析 query 字符串为对象。
 * 支持重复键（→数组）、a[]=1 括号格式、嵌套 key（a[b]=1 → { a: { b: 1 } }）。
 */
export function parseQuery(query: string, options: ParseOptions = {}): Record<string, ParsedValue> {
  const arrayFormat = options.arrayFormat ?? 'repeat'
  const result: Record<string, ParsedValue> = {}

  // 去掉开头的 ? 或 #
  let s = query.trim()
  if (s.startsWith('?') || s.startsWith('#')) s = s.slice(1)
  if (!s) return result

  const pairs = s.split('&')
  for (const pair of pairs) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1)
    if (!rawKey) continue

    let key = decodeURIComponent(rawKey)
    let value: ParsedValue = decodeValue(rawValue, options)

    // 括号数组格式：a[]=1 → key 去掉 []
    if (arrayFormat === 'bracket' && key.endsWith('[]')) {
      key = key.slice(0, -2)
      const existing = result[key]
      if (existing === undefined) {
        result[key] = [value]
      } else if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[key] = [existing, value]
      }
      continue
    }

    // 嵌套 key：a[b]=1
    if (key.includes('[')) {
      const match = key.match(/^([^[\]]+)\[([^[\]]*)\]$/)
      if (match) {
        const parent = match[1]
        const childKey = match[2] || '0'
        const parentVal = result[parent]
        const childObj: Record<string, ParsedValue> =
          parentVal && typeof parentVal === 'object' && !Array.isArray(parentVal) ? (parentVal as Record<string, ParsedValue>) : {}
        childObj[childKey] = value
        result[parent] = childObj
        continue
      }
    }

    // 重复键 → 数组
    const existing = result[key]
    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }
  return result
}

/** 解析当前页面 location.search / location.hash（Node 环境返回空对象） */
export function parseLocation(search?: string): Record<string, ParsedValue> {
  if (search !== undefined) return parseQuery(search)
  if (typeof location === 'undefined') return {}
  return parseQuery(location.search)
}

function encodeKey(key: string): string {
  return encodeURIComponent(key)
}

function encodePrimitive(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return encodeURIComponent(String(value))
}

/**
 * 把对象序列化为 query 字符串（不含开头的 ?）。
 * 数组用 repeat（a=1&a=2）或 bracket（a[]=1&a[]=2）格式；null/undefined 的值跳过。
 */
export function stringifyQuery(obj: Record<string, unknown>, options: ParseOptions = {}): string {
  const arrayFormat = options.arrayFormat ?? 'repeat'
  const parts: string[] = []

  const push = (key: string, value: unknown) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      for (const item of value) {
        if (arrayFormat === 'bracket') {
          push(`${key}[]`, item)
        } else {
          push(key, item)
        }
      }
      return
    }
    if (typeof value === 'object') {
      // 嵌套对象：a[b]=1
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}[${k}]`, v)
      }
      return
    }
    parts.push(`${encodeKey(key)}=${encodePrimitive(value)}`)
  }

  for (const [key, value] of Object.entries(obj)) {
    push(key, value)
  }
  return parts.join('&')
}

/** 给 URL 设置/合并 query 参数（保留原 URL 其余部分） */
export function setQuery(url: string, params: Record<string, unknown>, options: ParseOptions = {}): string {
  const [base, hash = ''] = url.split('#', 2)
  const [path, query = ''] = base.split('?', 2)
  const merged = { ...parseQuery(query, options), ...params }
  return path + '?' + stringifyQuery(merged, options) + (hash ? '#' + hash : '')
}

/** 删除 URL 中的指定 query 参数 */
export function removeQuery(url: string, keys: string | string[]): string {
  const removeKeys = new Set(Array.isArray(keys) ? keys : [keys])
  const [base, hash = ''] = url.split('#', 2)
  const [path, query = ''] = base.split('?', 2)
  const kept = query
    .split('&')
    .filter((pair) => {
      if (!pair) return false
      const eq = pair.indexOf('=')
      const rawKey = eq === -1 ? pair : pair.slice(0, eq)
      let key = rawKey
      try {
        key = decodeURIComponent(rawKey)
      } catch {
        /* 保持原样 */
      }
      return !removeKeys.has(key) && !removeKeys.has(key.replace(/\[\]$/, ''))
    })
    .join('&')
  return path + (kept ? '?' + kept : '') + (hash ? '#' + hash : '')
}

/** 取单个参数（自动类型）。多个值返回数组。 */
export function getQueryParam(query: string, key: string): ParsedValue | undefined {
  return parseQuery(query)[key]
}
