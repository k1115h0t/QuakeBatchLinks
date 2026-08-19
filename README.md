# QuakeBatchLinks

[中文](#中文) | [English](#english)

**QuakeBatchLinks** 是一个用于 Quake Web 的 Tampermonkey 用户脚本：批量打开/复制当前搜索结果中的 Web 链接，按资产去重，并在 `http_load_url` 缺失时基于同一响应数据进行本地 URL 补全。

**QuakeBatchLinks** is a Tampermonkey userscript for Quake Web that batch opens/copies Web links from current search results, deduplicates by asset, and locally reconstructs a URL when `http_load_url` is missing.

[安装 / Install userscript](https://raw.githubusercontent.com/k1115h0t/QuakeBatchLinks/main/QuakeBatchLinks.user.js)

> 非官方 Quake Web 油猴脚本。脚本只读取 Quake Web 自身已经发出的搜索请求响应，不主动发送或重放 Quake API 请求。
>
> Unofficial userscript for Quake Web. It only observes responses to search requests already issued by Quake Web and does not actively send or replay Quake API requests.

---

## 中文

### 功能

- **纯被动响应读取**：只观察 Quake Web 自己已经发起的搜索请求及其响应。
- **不主动请求、不重放请求**：不使用 `GM_xmlhttpRequest`，不创建新的 `XMLHttpRequest`，也不会主动执行额外的 Quake `fetch()`。
- **按资产去重**：优先使用 Quake 响应中的 `row.id` 作为资产唯一键；如果 `id` 缺失，则使用 `ip + domain + port + transport + service.name` 作为 fallback key。
- **明确显示去重数量**：面板显示原始数据数、唯一资产数、被去重数据数、链接数、本地补全数和无链接资产数。
- **资产内 URL 去重**：同一个资产内部重复的 URL 只保留一次。
- **不同资产不按 URL 合并**：两个不同资产即使拥有相同 URL，也仍按两个资产处理。
- **缺失 URL 本地补全**：当某个资产没有有效 `http_load_url` 时，脚本只使用同一响应中的 `service.name + service.http.host/domain/ip + port` 在本地构造 URL。
- **批量复制**：一行一个链接复制到剪贴板。
- **批量打开**：在后台标签页中依次打开；数量较多时会二次确认并以短间隔创建标签页，降低瞬时资源压力。
- **当前页覆盖**：翻页或重新搜索后，新响应替换旧响应，不累计历史页面。

### 数据来源

脚本只匹配 Quake Web 的以下请求：

```text
POST https://quake.360.net/api/search/query_string/quake_service
```

优先读取：

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

如果 `row.id` 缺失，则使用：

```text
ip | domain | port | transport | service.name
```

如果这些字段也全部缺失，则使用当前响应内的行号，避免把未知记录错误合并。

### URL 本地补全规则

当一个唯一资产没有任何有效的 `http_load_url` 时，脚本会尝试使用**同一份已收到的响应**在本地构造 URL，不会因此发起新的 Quake API 请求。

协议判断：

```text
service.name = http/ssl / https / HTTP+SSL/TLS  -> https
service.name = http                           -> http
```

主机选择优先级：

```text
service.http.host
      ↓
domain
      ↓
ip
```

端口处理：

- `http:80` 省略端口；
- `https:443` 省略端口；
- 其他有效端口保留。

示例：

```text
service.name = http/ssl
service.http.host = 33358zc.swarmping26.lol
port = 443
http_load_url = []
```

本地补全结果：

```text
https://33358zc.swarmping26.lol/
```

面板中的 `补全` 只统计这种通过响应字段本地构造出来的链接。

### 面板统计

示例：

```text
Quake 资产链接工具                           30 资产
原始 30 · 去重 0 · 链接 30 · 补全 1 · 无链接 0

[打开全部]  [复制全部]

已捕获当前搜索响应 · XHR
```

其中：

- `原始`：响应 `data[]` 的原始条数；
- `资产`：资产级去重后的唯一资产数量；
- `去重`：`原始条数 - 唯一资产数`；
- `链接`：所有唯一资产最终拥有的有效链接总数；
- `补全`：原始 `http_load_url` 缺失后，根据同一响应字段在本地构造链接的资产数；
- `无链接`：在原始链接与本地补全之后，仍然无法得到有效 URL 的唯一资产数量。

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

本地 URL 补全只处理当前响应中的少量字符串字段；补全详情仅用于当前处理和控制台提示，不作为历史数据长期缓存。

JavaScript 无法强制浏览器立即执行垃圾回收；脚本通过缩短对象引用生命周期，让不再使用的对象尽快变成 GC 可回收对象。

### 安装

1. 安装 Tampermonkey。
2. 打开上方 `安装 / Install userscript` 链接。
3. 在 Tampermonkey 中确认安装。
4. 完整刷新 `https://quake.360.net/quake/`。
5. 正常执行一次 Quake 搜索。
6. 页面右下角会显示 `Quake 资产链接工具`。

### 更新日志

#### v1.2.0

- 增加 `http_load_url` 缺失时的本地 URL 补全；
- 增加 `补全` 统计；
- 保持资产级去重语义不变；
- 仍然不产生任何额外 Quake API 请求。

#### v1.1.0

- 从全局 URL 去重改为资产级去重；
- 增加原始/资产/去重/链接/无链接统计。

### 安全边界

该脚本不会替你判断目标是否经过授权。请仅访问你有权查看、测试或管理的系统，并遵守 Quake 平台规则及适用法律法规。

### 免责声明

本项目是独立的第三方用户脚本，与 Quake 或 360 官方无隶属、授权或背书关系。Quake Web 的前端接口或响应结构变化可能导致脚本需要更新。

---

## English

### Features

- **Passive response observation only**: observes search requests already initiated by Quake Web.
- **No active API requests or replay**: does not use `GM_xmlhttpRequest`, does not create new `XMLHttpRequest` instances, and does not issue an extra Quake `fetch()` request.
- **Asset-level deduplication**: prefers Quake's `row.id` as the unique asset key; if absent, falls back to `ip + domain + port + transport + service.name`.
- **Visible statistics**: shows raw rows, unique assets, deduplicated rows, final links, locally reconstructed links, and assets still without a link.
- **Per-asset URL deduplication**: duplicate URLs within the same asset are kept only once.
- **No cross-asset URL merging**: different assets remain separate even when they point to the same URL.
- **Local URL fallback**: if an asset has no valid `http_load_url`, the userscript reconstructs a URL locally from `service.name + service.http.host/domain/ip + port` in the same response.
- **Copy all**: copies one URL per line.
- **Open all**: opens links in background tabs; large batches require confirmation and are opened with a short delay to reduce burst resource usage.
- **Current-page replacement**: a new search/page response replaces the previous in-memory result instead of accumulating history.

### Data source

The userscript only matches this Quake Web request:

```text
POST https://quake.360.net/api/search/query_string/quake_service
```

Primary URL field:

```text
data[i].service.http.http_load_url[]
```

Preferred asset key:

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

When `row.id` is absent, the fallback key is:

```text
ip | domain | port | transport | service.name
```

If all of those fields are also absent, the current response row index is used to avoid incorrectly merging unknown records.

### Local URL fallback

If a unique asset has no valid `http_load_url`, the userscript may build one locally from fields in the **same already-received response**. This does not trigger any extra Quake API request.

Protocol mapping:

```text
http/ssl / https / HTTP+SSL/TLS -> https
http                            -> http
```

Host preference:

```text
service.http.host
      ↓
domain
      ↓
ip
```

Port handling:

- omit `80` for HTTP;
- omit `443` for HTTPS;
- preserve other valid ports.

Example:

```text
service.name = http/ssl
service.http.host = 33358zc.swarmping26.lol
port = 443
http_load_url = []
```

Local result:

```text
https://33358zc.swarmping26.lol/
```

The panel's `补全` value counts assets whose final link came from this local fallback.

### Panel statistics

Example:

```text
Quake 资产链接工具                           30 资产
原始 30 · 去重 0 · 链接 30 · 补全 1 · 无链接 0

[打开全部]  [复制全部]

已捕获当前搜索响应 · XHR
```

Definitions:

- `原始` (Raw): rows in response `data[]`;
- `资产` (Assets): unique assets after asset-level deduplication;
- `去重` (Dedup): `raw rows - unique assets`;
- `链接` (Links): final valid links across all unique assets;
- `补全` (Fallback): assets whose link was locally reconstructed because the original `http_load_url` was missing/invalid;
- `无链接` (No link): assets still without a valid URL after both primary extraction and local fallback.

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

Local fallback only processes a few string fields from the current response. Fallback details are temporary and are not retained as search history.

JavaScript cannot force the browser to run garbage collection immediately. The script keeps object lifetimes short so unused objects become eligible for GC as early as practical.

### Installation

1. Install Tampermonkey.
2. Open the `安装 / Install userscript` link above.
3. Confirm installation in Tampermonkey.
4. Fully reload `https://quake.360.net/quake/`.
5. Run a normal Quake search.
6. The `Quake 资产链接工具` panel will appear in the bottom-right corner.

### Changelog

#### v1.2.0

- Added local URL fallback when `http_load_url` is missing;
- Added `补全` / fallback statistics;
- Preserved asset-level deduplication semantics;
- Still issues no extra Quake API requests.

#### v1.1.0

- Switched from global URL deduplication to asset-level deduplication;
- Added raw/assets/dedup/links/no-link statistics.

### Security boundary

This userscript does not determine whether a target is authorized for you to access. Only access, test, or manage systems for which you have appropriate authorization, and follow Quake's platform rules and applicable laws.

### Disclaimer

This is an independent third-party userscript and is not affiliated with, authorized by, or endorsed by Quake or 360. Changes to Quake Web's frontend API or response structure may require updates to the script.
