# url-query-kit

URL query 解析与序列化，零依赖、全 TypeScript。数组/对象/重复键、类型保留、增删改参数。从 SaaS 平台的列表筛选、分页参数、分享链接场景提炼。

## 安装

```bash
npm install url-query-kit
```

## 快速开始

```ts
import { parseQuery, stringifyQuery, setQuery, removeQuery, getQueryParam } from 'url-query-kit'

// 解析（重复键 → 数组，自动类型推断）
parseQuery('a=1&a=2&num=3&bool=true&empty=')  // { a: [1,2], num: 3, bool: true, empty: null }

// 序列化（null/undefined 自动跳过）
stringifyQuery({ a: 1, b: 'hello world', c: [1,2,3], d: null })  // 'a=1&b=hello%20world&c=1&c=2&c=3'

// 数组格式（括号）
stringifyQuery({ tag: ['a','b'] }, { arrayFormat: 'bracket' })   // 'tag[]=a&tag[]=b'

// 增删改
setQuery('https://x.com/p?old=1#hash', { new: '值', old: 2 })   // 合并参数
removeQuery('https://x.com/p?a=1&b=2&c=3#h', ['a', 'c'])        // 'https://x.com/p?b=2#h'

getQueryParam('?count=42', 'count')                              // 42（数字）
```

## API

| 函数 | 说明 |
| --- | --- |
| `parseQuery(query, options?)` | 解析 query → 对象 |
| `parseLocation(search?)` | 解析当前页面 location.search |
| `stringifyQuery(obj, options?)` | 对象 → query 字符串 |
| `setQuery(url, params)` | 合并/覆盖参数 |
| `removeQuery(url, keys)` | 删除参数 |
| `getQueryParam(query, key)` | 取单个参数 |

选项：`autoType`(自动类型推断，默认 true)、`emptyToNull`(空串转 null，默认 true)、`arrayFormat`(`repeat`/`bracket`)。

## ⚠️ 三个必须知道的坑

### 1. 手写拼接会漏 `encodeURIComponent`

`?name=` + name 这种拼接，一旦 name 里有 `&`、`=`、`#`、中文、空格就全乱了。序列化必须对 key/value 做 `encodeURIComponent`，解析时对应 `decodeURIComponent`。本库全部处理，`a&b`、`hello world`、中文都安全。

### 2. 重复键和「单个值」要区分

`a=1&a=2` 应该解析成数组 `[1,2]`，但**只有一个值**时不能也包成数组——`a=1` 应该是 `1` 而不是 `[1]`。本库用「首次赋值、再次出现才升级为数组」的策略，既支持重复键又不过度包装。

### 3. 解析出的值默认是字符串，类型会丢

`?count=42&flag=true` 用 `URLSearchParams` 拿到的是字符串 `'42'` 和 `'true'`，做 `if (flag)` 判断会踩坑。本库默认**自动推断类型**（`'1'`→1、`'true'`→true、`'null'`→null、空串→null），可用 `{ autoType: false }` 关闭。

## 实现要点

- 嵌套支持 `a[b]=1` → `{ a: { b: 1 } }`。
- 序列化 `null/undefined` 自动跳过（对齐主流库行为）。
- `setQuery`/`removeQuery` 保留 URL 的 path 和 `#hash` 部分。

## License

MIT
