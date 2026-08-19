# QuakeBatchLinks

[中文](#中文) | [English](#english)

**QuakeBatchLinks** 是一个用于 Quake Web 的 Tampermonkey 用户脚本：批量打开/复制当前搜索结果中的 Web 链接，并按资产去重。

**QuakeBatchLinks** is a Tampermonkey userscript for Quake Web that batch opens/copies Web links from the current search results with asset-level deduplication.

[安装 / Install userscript](https://raw.githubusercontent.com/k1115h0t/QuakeBatchLinks/main/QuakeBatchLinks.user.js)

> An unofficial Tampermonkey userscript for Quake Web. It passively reads the response of Quake Web's own search request, deduplicates results by asset, and provides batch open/copy actions for `http_load_url`.
>
> 非官方 Quake Web 油猴脚本：被动读取 Quake Web 自身搜索请求的响应，按资产去重，并批量打开或复制 `http_load_url`。

---

## 中文

### 功能

- **纯被动响应读取**：只观察 Quake Web 自己已经发起的搜索请求及其响应。
- **不主动请求、不重放请求**：脚本不会自行调用 Quake 搜索 API，不使用 `GM_xmlhttpRequest`，不会创建新的 `XMLHttpRequest`，也不会主动执行额外的 Quake `fetch()`。
- **按资产去重**：优先使用 Quake 响应中的 `row.id` 作为资产唯一键；如果 `id` 缺失，则使用 `ip + domain + port + transport + service.name` 作为 fallback。
- **明确显示去重数量**：面板显示原始数据数、唯一资产数、被去重数据数、可用链接数和无链接资产数。
- **资产内 URL 去重**：同一个资产内部重复的 `http_load_url` 只保留一次。
- **不同资产不按 URL 合并**：两个不同资产即使拥有相同 URL，也仍按两个资产处理。
- **批量复制**：一行一个链接复制到剪贴板。
- **批量打开**：在后台标签页中依次打开；数量较多时会二次确认并以短间隔创建标签页，减少瞬时资源压力。
- **当前页覆盖**：翻页或重新搜索后，新响应替换旧响应，不累计历史页面。

### 数据来源

脚本只匹配 Quake Web 的以下请求：

```text
POST https://quake.360.net/api/search/query_string/quake_service
```

并从已有响应中读取：

```text
data[i].service.http.http_load_url[]
```

资产主键优先使用：

```text
data[i].id
```

### 资产去重规则

假设某次响应包含 30 条原始数据，其中两条的 `id` 完全相同：

```text
原始数据：30
唯一资产：29
被去重数据：1
```

脚本会把同一资产的 URL 合并到该资产内部。不同资产之间即使 URL 一样，也不会因为 URL 相同而被去重。

如果 `row.id` 缺失，则使用以下字段组成 fallback key：

```text
ip | domain | port | transport | service.name
```

如果这些字段也全部缺失，则使用当前响应内的行号，避免把未知记录错误合并。

### 内存与资源策略

脚本的长期状态只保存：

- 当前页每个唯一资产的 URL 数组；
- 当前页的少量计数统计。

脚本不会长期保存：

- 完整 `Response`；
- `XMLHttpRequest` 实例；
- 完整搜索 JSON；
- 请求体；
- Cookie / Authorization；
- 历史页面搜索数据。

Fetch 路径仅在匹配目标接口后调用一次 `response.clone()`，随后立即解析并释放局部引用。`clone()` 本身不会重新发送 HTTP 请求。

XHR 路径使用 `WeakMap` 保存少量元数据，并在目标响应完成后主动删除对应条目。响应监听器使用 `{ once: true }`，避免 listener 持续累积。

JavaScript 无法强制浏览器立即执行垃圾回收；脚本通过缩短对象引用生命周期，让不再使用的对象尽快变成 GC 可回收对象。

### 安装

1. 安装 Tampermonkey。
2. 新建一个用户脚本。
3. 将 `QuakeBatchLinks.user.js` 的全部内容粘贴进去并保存。
4. 完整刷新 `https://quake.360.net/quake/`。
5. 正常执行一次 Quake 搜索。
6. 页面右下角会显示 `Quake 资产链接工具`。

### 面板统计

示例：

```text
Quake 资产链接工具                 29 资产
原始 30 · 去重 1 · 链接 29 · 无链接 0

[打开全部]  [复制全部]

已捕获当前搜索响应 · fetch
```

其中：

- `原始`：响应 `data[]` 的原始条数；
- `资产`：资产级去重后的唯一资产数量；
- `去重`：`原始条数 - 唯一资产数`；
- `链接`：所有唯一资产拥有的有效链接总数（只做资产内部 URL 去重）；
- `无链接`：没有有效 `http_load_url` 的唯一资产数量。

### 安全边界

该脚本不会替你判断目标是否经过授权。请仅访问你有权查看、测试或管理的系统，并遵守 Quake 平台规则及适用法律法规。

### 免责声明

本项目是独立的第三方用户脚本，与 Quake 或 360 官方无隶属、授权或背书关系。Quake Web 的前端接口或响应结构变化可能导致脚本需要更新。

---

## English

### Features

- **Passive response observation only**: observes search requests already initiated by Quake Web.
- **No active API requests or replay**: the userscript does not call the Quake search API on its own, does not use `GM_xmlhttpRequest`, does not create new `XMLHttpRequest` instances, and does not issue an extra Quake `fetch()` request.
- **Asset-level deduplication**: prefers Quake's `row.id` as the unique asset key. If `id` is missing, it falls back to `ip + domain + port + transport + service.name`.
- **Visible dedup statistics**: shows raw row count, unique asset count, deduplicated row count, usable link count, and assets without links.
- **Per-asset URL deduplication**: duplicate `http_load_url` values inside the same asset are kept only once.
- **No cross-asset URL merging**: two different assets remain separate even if they point to the same URL.
- **Copy all**: copies one URL per line.
- **Open all**: opens links in background tabs; large batches require confirmation and tabs are created with a short delay to reduce burst resource usage.
- **Current-page replacement**: a new search/page response replaces the previous in-memory result instead of accumulating history.

### Data source

The userscript only matches this Quake Web request:

```text
POST https://quake.360.net/api/search/query_string/quake_service
```

It reads URLs from the existing response at:

```text
data[i].service.http.http_load_url[]
```

The preferred asset key is:

```text
data[i].id
```

### Asset deduplication semantics

If a response contains 30 raw rows and two rows share the same asset `id`:

```text
Raw rows: 30
Unique assets: 29
Deduplicated rows: 1
```

URLs from duplicate rows of the same asset are merged into that asset. URLs are **not** globally deduplicated across different assets.

When `row.id` is absent, the fallback key is composed from:

```text
ip | domain | port | transport | service.name
```

If all of those fields are absent as well, the row index within the current response is used to avoid incorrectly merging unknown records.

### Memory and resource strategy

Long-lived state only contains:

- URL arrays for the unique assets on the current page;
- a small statistics object.

The userscript does **not** retain:

- full `Response` objects;
- `XMLHttpRequest` instances;
- full search JSON payloads;
- request bodies;
- Cookie / Authorization data;
- historical search pages.

On the Fetch path, `response.clone()` is called only for the matched endpoint, consumed immediately, and local references are released after parsing. `Response.clone()` does not send another HTTP request.

On the XHR path, minimal metadata is stored in a `WeakMap` and explicitly removed after the target response completes. The response listener uses `{ once: true }` so listeners do not accumulate.

JavaScript cannot force the browser to run garbage collection immediately. The script instead keeps object lifetimes short so unused objects become eligible for GC as early as practical.

### Installation

1. Install Tampermonkey.
2. Create a new userscript.
3. Paste the complete contents of `QuakeBatchLinks.user.js` and save it.
4. Fully reload `https://quake.360.net/quake/`.
5. Run a normal Quake search.
6. The `Quake 资产链接工具` panel will appear in the bottom-right corner.

### Panel statistics

Example:

```text
Quake 资产链接工具                 29 资产
原始 30 · 去重 1 · 链接 29 · 无链接 0

[打开全部]  [复制全部]

已捕获当前搜索响应 · fetch
```

Definitions:

- `原始` (Raw): number of rows in the response `data[]`;
- `资产` (Assets): number of unique assets after asset-level deduplication;
- `去重` (Dedup): `raw rows - unique assets`;
- `链接` (Links): total valid links across assets, with deduplication only within each asset;
- `无链接` (No link): unique assets without a valid `http_load_url`.

### Security boundary

This userscript does not determine whether a target is authorized for you to access. Only access, test, or manage systems for which you have appropriate authorization, and follow Quake's platform rules and applicable laws.

### Disclaimer

This is an independent third-party userscript and is not affiliated with, authorized by, or endorsed by Quake or 360. Changes to Quake Web's frontend API or response structure may require updates to the script.
