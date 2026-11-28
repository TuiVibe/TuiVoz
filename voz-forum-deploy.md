# TuiVoz — Kiến trúc & Triển khai

**TuiVoz**: SPA thin-client phong cách voz.vn — Vanilla ES modules, **zero build tool** — + Edge Proxy (Vercel `sin1` / `dev-server.mjs` local). Không database riêng: mọi đọc/ghi đi qua XenForo 2 REST API của `voz.vn`.

- **Token**: client không giữ Bearer/Guest Key. Session lưu trong cookie HttpOnly `voz_session`; Edge proxy gắn `Authorization`/`XF-Api-Key`.
- **OAuth2 + PKCE**: nút một-chạm mở `/forum/oauth2/authorize` qua proxy → proxy bắt redirect `vozma26://` → `/oauth-callback` → `/api/oauth/exchange` (§7.8). Fallback: userscript `public/userscript/` hoặc nhập tay `authorization_code`. Yêu cầu đủ 14 scope (`SCOPES` trong `api/handler.js`).
- **Upstream**: voz.vn API + HTML scrape (`/p/:id/reactions`), data.voz.vn (avatar, Range), api.imgur.com, pik.vn/api/upload, v.douyin.com, Flickr oEmbed.
- **Comments**: mọi file JS/CSS/HTML mở đầu bằng 1 dòng kdoc mô tả file (`/** … */` / `/* … */` / `<!-- … -->`; userscript đặt sau khối `==UserScript==`); mọi comment trong code đều 1 dòng ngắn (~≤10 từ) chỉ giữ "why"/gotcha, comment nói-lại-code bị xoá, divider `// foo` / `/* foo */`.
- **Verify**: `node --check` từng file JS/MJS
- **⚠️ BẮT BUỘC khi đổi file trong `public/assets/`** (JS/CSS/font/ảnh — đúng pattern `CACHEABLE` trong `sw.js`): bump `CACHE` version trong `public/sw.js` (`tv-static-vN` → `vN+1`) trước khi deploy. SW cache-first và chỉ dọn cache cũ khi activate version mới — quên bump = user giữ asset cũ tới tận 30+ ngày (đây chính là nguồn bug "deploy rồi mà không thấy đổi gì"). File ngoài `/assets/` (sw.js, index.html, userscript) không bị cache nên không cần bump.

## Cấu trúc thư mục

```
TuiVoz/
├── api/handler.js        # Edge Function: API gateway duy nhất (Xem bảng route bên dưới)
├── api/index.js          # Re-export handler cho /api
├── dev-server.mjs        # Dev server local: Request/Response web-standard + static + SPA fallback
├── vercel.json           # Rewrites + cache headers (region sin1, outputDirectory public)
├── package.json · README.md · LICENSE · AGENTS.md   # AGENTS.md: hướng dẫn AI agent (đọc file này trước)
├── public/
│   ├── index.html        # SPA shell (font preload, anti-FOUC theme script, route-only CSS load async print-onload + noscript)
│   ├── favicon.ico · robots.txt · site.webmanifest · sw.js
│   ├── userscript/voz-oauth-helper.user.js   # Tampermonkey: PKCE + bắt OAuth code trên voz.vn
│   └── assets/
│       ├── api.js        # Client SDK gọi /api/*
│       ├── app.js        # Entry: boot, listener toàn cục, wire module UI
│       ├── app.css       # CSS bundle stale — không file nào tham chiếu
│       ├── core/         # dom, router, nav, paths, icons, utils
│       ├── lib/          # Logic nghiệp vụ (bbcode, media, settings, stickers, upload…)
│       ├── filters/      # Engine Bộ lọc (match/filters/apply/editor) — xem §7.4
│       ├── ui/           # Component (editor, post, lightbox, modal, chrome…)
│       ├── views/        # Màn hình theo route (forum, thread, dm, settings, user…)
│       ├── css/          # Stylesheet
│       ├── fonts/ img/   # 6 bộ webfont WOFF2 subset latin+vi (Be Vietnam/Pro, Roboto, Cantarell, Segoe UI, SF Pro); icon/logo
```

## Bản đồ module

### `api/` + dev server

| File | Vai trò |
|---|---|
| `api/handler.js` | Route: `/api/oauth/*` (exchange/status/logout/refresh, cookie `voz_session` Base64URL); `/api/xf/*` proxy XenForo (Bearer nếu login, fallback `XF-Api-Key` guest; retry refresh khi 401; hỗ trợ multipart); `/api/pik/upload` → pik.vn; `/api/image-download` (bypass Cloudflare, Range cho GIF); `/api/attachment-download?id=[&name=]` (voz.vn `/attachments/<id>/` trả **403 guest**, phải tải server-side: metadata → `direct_url` → stream; `?name=` → `inline` cho `<img>`/lightbox, ngược lại `attachment`); `/api/xf/imgur/*`; `/api/xf/douyin`; `/api/xf/oembed`; `/api/forum/*` full-page voz.vn proxy (login/`xf_session`/push — §7.7); scrape `/p/:id/reactions` (cache 60s). |
| `api/index.js` | Re-export handler. |
| `dev-server.mjs` | `node dev-server.mjs [port]` (`argv[2]`/`PORT`, default 3000) — chuyển `http.IncomingMessage` → web `Request`, gọi `handler()` cho `/api/*` + `/forum/*` (map `/forum/x` → `/api/forum/x`, kèm multi `set-cookie`); static `public/` `no-store`; asset/root-file (`/assets`, `/userscript`, `favicon.ico`, `site.webmanifest`, `robots.txt`) thiếu → **404** không fallback shell; route khác → `index.html`. |

### `assets/` gốc

| File | Chức năng |
|---|---|
| `api.js` | Client SDK: `xf(path, {method,query,body,json,form})` → `/api/xf/*`; object `api` (endpoint helper) + `auth` (OAuth status/exchange/logout); `ApiError` với `code`/`params`. |
| `app.js` | Boot: import + `wire*()` toàn bộ (theme, header menus, nav shortcuts, auto-hide, image fallback/download, static avatar, screenshot, quotes, lightbox, filtered reveals), `route()` handler, dynamic import `bannedUsers`. |

### `core/`

| File | Chức năng |
|---|---|
| `dom.js` | Handle DOM gốc + `state` toàn cục (`me`, `loggedIn`, `reactions`, `activeNav`, `breadcrumbs`). |
| `router.js` | History router: tách `page-N`, dispatch view, redirect `/p/:id` và `/t/:id/unread`, `?post=<id>` → `/t/<slug>.<id>/page-N/#post-<id>` (`postLocation`, §7.1). Views lazy `await import()` trừ forum/thread (§7.6). |
| `nav.js` | `navigate()` không reload; lưu/khôi phục scroll per history entry; `keepCurrentScroll`/`keepScroll` cho anchor. |
| `paths.js` | Path chuẩn SEO: `threadPath`, `forumPath`, `userPath`, `dmPath`, `withPage`, `postPage`/`postPath` → `/t/<slug>.<id>/page-N/#post-<id>`. |
| `icons.js` | SVG icon inline dạng hàm. |
| `utils.js` | `esc`, `num` (K/M), `timeAgo`, `fullDate`, `postDate`, `joinDate`. |

### `lib/`

| File | Chức năng |
|---|---|
| `attachments.js` | Map `[ATTACH]id[/ATTACH]` → URL; `attachmentViewUrl` (CDN dùng thẳng, còn lại qua proxy), `attachmentViewUrlForId`. |
| `uploadAttachments.js` | Upload đính kèm native voz: `new-key` → `/attachments` → `attachment_key` → `DELETE`; `AttachmentUploads` trên `editor._uploads`; fallback `[IMG]` pik.vn. |
| `avatar.js` / `avatarStatic.js` | URL avatar `data.voz.vn/avatars` bucket `id/1000` + fallback ký tự; đóng băng GIF/APNG frame đầu. |
| `bbcode.js` | `sanitizeHtml`, `bbcodeToPlain`, `rewriteAttachmentImages()` (sửa `voz.vn/attachments/<id>/` bị 403). |
| `editorCodec.js` | Biên dịch BBCode ↔ DOM editor 2 chiều (AST). |
| `imageDownload.js` / `imageFallback.js` | Nút tải ảnh (proxy nếu CORS); `data-onerror="hide-parent"`. |
| `imgurImport.js` | Import album sticker Imgur qua proxy. |
| `jumpToAnchor.js` | Scroll tới `#post-N` dưới sticky header; bù ảnh tải muộn; `revealFilteredBlock` cho post bị ẩn. |
| `media.js` | Embed YouTube/TikTok/Facebook/Reddit/Twitter/SoundCloud/Douyin/Flickr. |
| `pikUpload.js` | Upload ảnh pik.vn: resize ≤1920px JPEG 0.85, song song 3 luồng → `[IMG]`. |
| `postLinks.js` | Rewrite link voz.vn → URL SPA (local route) hoặc `/forum/…` (XenForo-only route, qua proxy giữ session). `/whats-new`+`/whats-new/posts` exact → `/new` (`WHATS_NEW_MAP`); `/goto/post?id=N` → `/p/N/` (§7.9); `/whats-new/latest-activity`/`profile-posts` không có API → link `/forum/…` proxy thường (full nav), không cần route SPA riêng. |
| `postScreenshot.js` | `renderPostPng` (SVG foreignObject, proxy ảnh → dataURI chống taint; `data:` SVG cho Chrome) + popup Sao chép / Chia sẻ / Tải xuống (Web Share L2; Firefox không share file → fallback URL). |
| `prefix.js` / `userBadges.js` | Màu/nhãn prefix thread; huy hiệu member. |
| `quotes.js` / `spoilers.js` / `signature.js` | Collapse quote >800px (fade overlay 400px `.quote-expand-link` — phải giữ `z-index` thấp + `overflow:hidden` trên blockquote, trước đây z-100 trùng z nav → overlay đè lên sticky header/nav khi cuộn lên); toggle spoiler; render chữ ký. |
| `settings.js` | `localStorage['voz-settings:v1']`: theme, font, scale, auto-hide, sticker albums, `vozSupport`, `postScreenshot` (default BẬT), `reactorNames` (default TẮT — không render strip; count trên nút ưng/gạch có gạch chấm, bấm mở modal reactor list; bật mới eager-load tên như voz), `proxyImages` (default TẮT — bật: mọi ảnh remote → `/api/image-download` trên edge, giảm latency nhưng tốn băng thông Vercel), `autoHideChrome` (default BẬT — tắt: thanh logo/shortcut/avatar ghim cố định, không trượt đi khi cuộn xuống), `mergeShortcuts` (default BẬT — như autoHideChrome, `!== false`; bật: shortcut gộp chung hàng với account icons trong `.p-header-shortcuts` strip, logo + `.p-nav` ẩn hẳn; KHÔNG có dropdown overflow — strip `overflow-x:auto` cuộn ngang: mobile vuốt ngang native, desktop kéo chuột drag-to-scroll (chrome.js `wireMergedScroll`: mousedown trên strip, mousemove/mouseup trên window — KHÔNG dùng setPointerCapture vì nó retarget click lên ul làm link không click được; dead zone 5px; click trong 150ms sau drag bị chặn; shift+wheel/trackpad ngang native; hover strip: vertical wheel dịch sang scrollLeft ngang và LUÔN preventDefault kể cả chạm đầu/cuối — trang tuyệt đối không cuộn khi chuột ở trên strip (yêu cầu user); muốn cuộn trang phải rê chuột ra khỏi strip); scrollbar ẩn (`scrollbar-width:none`), mask fade mép phải; ul bắt buộc `flex:1 1 0; min-width:0` nếu không flex min-width:auto chặn overflow; merged mode còn siết khoảng trống dưới header — `.p-body` padding-top 14px→0 + `.p-breadcrumbs` line-height 21px→15px (không khí trong line-height làm text nhìn xa header dù margin/padding đã = 0; margin-bottom giữ 10px — siết xuống 4px làm breadcrumb dính block-header bên dưới) chỉ trong `:root.shortcuts-merged`, vì mất nav bar nên khoảng trống mặc định đọc như một band trống); import/export JSON. |
| `imgProxy.js` | `imgSrc(url)` — bọc URL ảnh remote → `/api/image-download` khi `proxyImages` bật (path nội bộ giữ nguyên). Dùng bởi `avatar.js`, `attachments.js` (direct_url + thumbnail), `ui/post.js` (attachment thumb), `ui/lightbox.js` (ảnh full), `bbcode.js` `proxyRemoteImages` (mọi `<img src^=http>` còn lại trong post HTML), `smilies.js` + `editorTools.js` (emoji `data.voz.vn/styles/.../smilies/`), `reactions.js`/`alertMarkup.js` (reaction icons). |
| `signals.js` | Analytics `/voz/signals`: queue open/read, flush 5s/20 events/pagehide (chỉ logged-in). |
| `smilies.js` | Danh mục `/voz/smilies` + regex thay emoticon → `<img>`. |
| `stickers.js` | Sticker IndexedDB (`TuiVozStickerStorage`): album, recent, cache offline. |
| `supportBeacon.js` | Beacon `/forum/xfmg.php` qua proxy (opt-in `vozSupport`, throttle 60s, 1 ping/route). |
| `unread.js` | Dò bài chưa đọc đầu tiên từ `visitor_read_date`. |
| `bannedUsers.js` | Đánh dấu user bị ban (KIA): phát hiện qua errcode `this_users_profile_is_not_available`, thêm class `username--banned`; `wireBannedUsernames`/`clearBannedMarks` (import động từ `app.js`). |
| `catalogs.js` | Cache `localStorage` TTL 24h cho catalog ít đổi (nodes, reactions, smilies) + cache memory. |
| `dataSaving.js` | Chế độ tiết kiệm dữ liệu: 3 trạng thái + auto theo Network Information API; consumer dùng thumbnail thay ảnh gốc (media, lightbox). |

### `filters/` — engine Bộ lọc (chi tiết §7.4)

| File | Chức năng |
|---|---|
| `match.js` | `FIELD_DEFS`/`OPERATORS`/`ACTIONS`/`SCOPES`/`JOINS`; `compilePattern`, `fieldValue`, `filterMatches` (joiner VÀ/HOẶC trái→phải, **không short-circuit**), `matchingFilter` (đầu tiên khớp thắng), `URL_MODES` (`plain`="Đường dẫn"/`wildcard`/`regex`), `normalizeUrlRule`, `customUrlMatches`. Mọi lỗi → `false` (fail-safe). |
| `filters.js` | Store `localStorage['voz-filters:v1']`: CRUD, `moveFilter`, `setFilterEnabled`, `restoreFilters`, `filtersForScope`; bắn `voz:filters-change`. |
| `apply.js` | `threadEntriesHtml`/`postEntriesHtml` bọc render: `delete` bỏ hẳn; `highlight` viền 4 cạnh; `hide` → `.filtered-block` + nút `.filtered-reveal` (id `post-N` giữ trên wrapper `<div>`); `revealFilteredBlock`/`wireFilteredReveals`. |
| `editor.js` | UI tab Bộ lọc + modal: scopes radio (`posts`→`threads`→`custom`), actions, joiner per-condition, URL rules nhiều dòng (`{v,m}` + select mode, nút +). |

### `ui/`

| File | Chức năng |
|---|---|
| `editor.js` / `editorTools.js` / `stickerPicker.js` / `mentionMenu.js` | Visual editor BBCode (draft, drag-paste → pik.vn); toolbar; picker sticker `[IMG size="80x80"]`; gợi ý `@user` (`/users/find-name`). |
| `post.js` | Template `.message`; `postHtml`/`messageHtml` nhận `{id, extraClass, extraStyle}`; `attachmentsBlockHtml` (thumb → lightbox, file → `/api/attachment-download?id=`). |
| `lightbox.js` | Overlay xem ảnh: capture-click trên `.message-userContent`, gallery DOM order, nút zoom `−`/`+` (×1.5, max ×6), wheel/double-click/drag-pan; **chỉ đóng bằng ✕/Esc**. |
| `threadRow.js` | Row chủ đề/kết quả; `threadRow`/`postRow`/`member*Row` nhận `perPage` + `extraClass`/`extraStyle` + link qua `postPath`. |
| `inlineEdit.js`, `reactions.js`, `postNumberPopup.js`, `memberTooltip.js`, `threadModeration.js`, `imageResizer.js`, `titleHold.js` | Sửa tại chỗ; reaction bar + strip người thả (strip chỉ render khi `reactorNames` bật; tắt → bấm `.reaction-count` trên nút reaction mở modal `.modal--reactors` list đầy đủ giống voz, listener capture-phase chạy trước react handler — avatar scrape từ `img.avatar` trong HTML `/p/:id/reactions`, `data-member-id` wire `memberTooltip` hover/tap; click tên trong modal đóng modal + đi tới profile); popup permalink #post; hover card member; mod tools; overlay kéo-resize ảnh trong editor; nhấn giữ tiêu đề. |
| `forumNodes.js`, `headerMenus.js`, `unreadCounts.js`, `chrome.js`, `chromeAutoHide.js`, `infiniteScroll.js`, `pagination.js`, `theme.js`, `modal.js`, `feedback.js`, `title.js`, `session.js`, `alertMarkup.js` | Cây node; dropdown header; badge đỏ; header/breadcrumb/menu + nav shortcuts; auto-hide khi cuộn (REVEAL_THRESHOLD 8px); infinite scroll 3 chế độ; phân trang + `wirePageJump`/`updatePager`; theme/scale biến CSS; modal/toast/errorBox; `document.title`; `loadSession`/`requireLogin`; markup thông báo. |

### `views/`

| File | Route |
|---|---|
| `forum.js` | `viewHome` (node tree), `viewForum`, `viewSearchForum`, `viewNewThreads` (`/new`). |
| `thread.js` | `/t/<slug>.<id>/` — danh sách post, anchor, watch, quick reply + editor; signals `open`/`read` qua `voz:leave-thread`. |
| `compose.js` | `/f/:id/post-thread` — tạo chủ đề. |
| `dm.js` | `/direct-messages/` — `viewDmList`, `viewDm` (reply + rời hội thoại), `viewNewDm`. |
| `lists.js` | `viewAlerts` (mark read), `viewBookmarks`, `viewWatched`. |
| `search.js` | `/search`. |
| `user.js` | `/u/<slug>.<id>/` + `/pp/{id}` — memberHeader, 4 tab (tường/hoạt động/bài đăng/giới thiệu); follow/ignore không có API → link voz.vn. |
| `login.js` | `/login` một-chạm qua proxy + `/oauth-callback` (userscript/nhập tay còn lại trong `<details>`). |
| `settings.js` | `/cai-dat-tuivoz` — tab: Giao diện, Hệ thống, Phím tắt, **Bộ lọc**, Sticker, Sao lưu (export/import JSON kèm `filters`). |

### `css/` (tên = vai trò)
`base` (biến theme sáng/tối) · `font-default` + `fonts` (webfont) · `layout` `forum` `post` `account` `home` · `editor` `forms` `media` `reaction` `headerMenus` `settings` `filters` `stickers` `avatar` `misc` `responsive` (breakpoints mobile) · `app` = gộp.

## Định tuyến & Cache (`vercel.json` + `handler.js`)

- `vercel.json`: `regions:["sin1"]`, `outputDirectory:"public"`; rewrite `/api` + `/api/(.*)` → `/api/handler?__path=`, `/forum(.*)` → `/api/handler?__path=forum$1`; SPA fallback → `index.html` trừ `api/`, `assets/`, `userscript/`, `robots.txt`, `sitemap.xml`, `sw.js` (`/forum/*` đã khớp rewrite riêng trước catch-all).
- Headers trong `vercel.json` chỉ có: `/assets/fonts/*` → `max-age=31536000, immutable`; `/assets/*` còn lại → `max-age=3600, stale-while-revalidate=86400`; `robots.txt` → `text/plain` + `max-age=3600`.
- `/api/*` **không** có header trong `vercel.json` — `handler.js` tự set `Cache-Control` per route: GET `/voz/*` pass-through ETag/`max-age` theo upstream (86400/3600/300 tuỳ tier), còn lại `private, no-store, max-age=0`.
- `image-download` có **in-memory server cache** (`IMAGE_CACHE` Map, 6h TTL, max 500, ≤512KB) — avatar URL immutable nên tránh gọi lại `data.voz.vn` mỗi trang; `X-Image-Cache: hit`; probe `limit=` không cache (sniff 64KB cho GIF frame-1).

## Triển khai

- **Yêu cầu**: Node.js 18+ (khuyên 20+).
- **Local**: `node dev-server.mjs 3000` → `http://localhost:3000` (đã gồm proxy `/api/*` + static, y hệt Edge).
- **Vercel**: `vercel` / `vercel --prod`; hoặc import repo trên dashboard — Root `TuiVoz`, Framework **Other**, Output `public`.

## Nhật ký sửa lỗi (tóm tắt + gotchas)

### §7.1 Permalink post thiếu trang → nhảy sai bài
Link `?post=<id>`/`post-<id>` không mang số trang → thread mở trang 1, anchor thiếu, scroll reset về đầu.
- `paths.js`: `postPage`/`postPath` → `/t/<slug>.<id>/page-N/#post-<id>` (dùng `position` + `perPage`).
- `threadRow.js` `postRow`/`memberPostRow`/`memberActivityRow` + views (search/lists/user) truyền `perPage`.
- `router.js` `postLocation(postId)` chuẩn hoá mọi `?post=` cũ trước render; `/p/:id` dùng chung; `/goto/post?id=N` cũng route local → `/p/N/` (§7.9).
- `views/thread.js`: có `focusPost` thì luôn `keepCurrentScroll()` trước khi jump.

### §7.2 Attachments không hiển thị
`message_parsed` chỉ render `[ATTACH]` inline; ảnh `voz.vn/attachments/<id>/` bị Cloudflare 403 guest.
- `api/handler.js` `/api/attachment-download` (xem §3.1); `lib/attachments.js` `attachmentViewUrl*`; `bbcode.js` `rewriteAttachmentImages`.
- `ui/post.js` `attachmentsBlockHtml`; `ui/lightbox.js` mới (zoom/pan, đóng bằng ✕/Esc); style trong `css/post.css`.

### §7.3 Nút "Chụp bài viết" → popup hành động
`lib/postScreenshot.js`: `renderPostPng` → `.post-share-popup` (pattern `postNumberPopup`): Sao chép / Chia sẻ / Tải xuống.
- **Gotcha**: Chrome taint canvas nếu SVG load qua `blob:` → dùng `data:image/svg+xml`. Firefox (mọi nền tảng) không hỗ trợ `navigator.share({files})` → fallback permalink.
- Timeout 60s + settle 15s/img để không treo khi ảnh hỏng.
- Setting `postScreenshot` default **BẬT** (chỉ `=== false` mới tắt); toggle tại `/cai-dat-tuivoz#system`.

### §7.4 Tab "Bộ lọc" (`/cai-dat-tuivoz#filters`)
Engine client-side RES-style ở `filters/`; storage `voz-filters:v1`; filter đầu tiên khớp thắng (ưu tiên = vị trí, ↑/↓ mobile, drag desktop).
- **Joiner**: `join:'custom'` — mỗi điều kiện (trừ đầu) có select VÀ/HOẶC, đánh giá trái→phải **không short-circuit** (`A VÀ B HOẶC C` = `(A∧B)∨C`). Legacy `all`/`any` vẫn hiểu.
- **Scopes** radio: `posts` (mặc định, cũng áp cho DM/search/bookmark) → `threads` → `custom` (Tự chọn). Field giới hạn theo scope: `threadOnly`/`postOnly`.
- **Custom URLs**: `filter.customUrls` = mảng rule `{v, m}`; `m ∈ URL_MODES` — `plain` ("Đường dẫn", substring CI của `location.pathname`, `*`/`?` là ký tự thường), `wildcard` (glob neo cả path), `regex` (`/re/flags` hoặc trần, default `i`). `urlRuleError` chặn regex lỗi. `normalizeUrlPattern` cắt scheme/host/query — **chỉ lưu pathname**; suy mode cho string cũ **sau** khi chuẩn hoá (dấu `?` trong query không tính wildcard).
- **Hide**: wrapper `.filtered-block` luôn `<div>` (**không** `<li>` — parser tách khỏi list-item scope), giữ `id="post-N"`/`conversation-message-N`; article trong đổi `filtered-post-N`; `jumpToAnchor`/hash-click gọi `revealFilteredBlock`.
- **Fail-safe**: regex lỗi, `ne` pattern hỏng, value rỗng, thiếu `User`, ngày hỏng → `false` (không match).
- Màu "Nổi bật": `COLOR_PRESETS` + ô nhập `CSS.supports` (không `input[type=color]`); `border: 1.5px solid` inline đủ 4 cạnh; cần `.filter-color-pick[hidden]{display:none}` vì `display:flex` override `hidden`.
- Mọi `.map(row).join()` ở views đổi sang `threadEntriesHtml`/`postEntriesHtml`; backup export/import kèm `filters` (`lib/settings.js`).

### §7.5 Beacon `/xfmg.php` (hỗ trợ tăng điểm voz)
- `lib/supportBeacon.js` `supportPing()`: gate `getVozSupport()` + `state.loggedIn`, throttle 60s, `new Image()` → **`/forum/xfmg.php?s=<m|d>:u:p1b0r1e0&n=<rand>`** (qua proxy — cookie `xf_*` sống trên origin TuiVoz nên hit thẳng `voz.vn` sẽ là **guest không tính điểm**, và fail hẳn trên mạng chặn DNS voz); gọi trong `finally` của `route()` (1 ping/navigation). Proxy forward cookie session → voz tính đúng tài khoản.
- **Detector thứ 3 — `window._xfr`/`xf_ls`**: voz nhúng `window._xfr="<token mỗi trang>"`; watchdog googletag (`slotRenderEnded` + iframe visible check) ghi token vào cookie `xf_ls` (rolling last-10, `xf_ls=a_b_c`) **chỉ khi ads render thật** — thiếu `xf_ls` = profile adblock. `sendSamTelemetry()` scrape `_xfr` từ HTML `/forum/` rồi tự set cookie `xf_ls` trên origin TuiVoz (proxy forward `xf_*` như cookie thật → voz thấy trail "ads đã render"). Cùng cơ chế đã thêm vào userscript `voz-script-bypassads/1.txt` v1.4 (write `xf_ls` trên DOMContentLoaded) và `TuiVozAutoLvUp` ping script.
- Thread page (`/t/…`) **không** có `.samItem` div — sam ads chỉ có trên listing (`/`, `/f/*`); track-view chỉ gửi được cho item trên page listing, đó là behavior thật của voz.
- Điểm chỉ được ghi khi user đã đăng nhập qua `/forum` (có `xf_session`/`xf_user` trên origin proxy); chỉ OAuth mà chưa login forum thì beacon vẫn đi nhưng guest.
- **Mọi traffic voz đều qua proxy** (đã quét toàn bộ client): fetch `/p/:id/reactions` (`reactions.js`), ảnh `[attach]` trong spoiler (`spoilers.js`), beacon xfmg — tất cả → `/forum/…`. Link `voz.vn` không có route SPA (`/report`, `/ignore`, `/account`…) được `rewriteVozLinks` → `/forum/…` (nav thường, app.js bỏ qua `/forum/` trong SPA click handler). Các link UI tĩnh ("Tạo chủ đề", "Tìm nâng cao", "Xem trên voz.vn") cũng → `/forum/…`. Còn lại `data.voz.vn` (avatar/CDN ảnh attachment) load trực tiếp — domain CDN riêng, thường không bị chặn DNS cùng `voz.vn`.

### §7.6 Hiệu năng tải trang (code split + cache)
- `core/router.js`: chỉ `forum.js`/`thread.js` eager; còn lại lazy `await import()` (compose/search/dm/lists/user/login/settings).
- `app.js`: `appConfig()` ∥ `loadSession()` chạy `Promise.all`; đăng ký `sw.js` ngay (guard `serviceWorker in navigator`, **không** bọc `load` — module eval chậm bỏ lỡ event).
- `index.html`: `editor.css`/`account.css` chuyển sang async `media="print" onload` (+ `<noscript>`).
- `public/sw.js`: cache-first chỉ `/assets/{css,icons,lib,ui,views,fonts}/`; `/api/*` + cross-origin bỏ qua. `vercel.json`: exclude `sw.js` khỏi SPA rewrite + header `no-cache`.
- `/api/image-download`: `IMAGE_CACHE` Map 6h/500 mục/≤512KB (`X-Image-Cache: hit`); probe `limit=` không cache.

### §7.7 Thông báo đẩy XenForo (web push)
voz.vn có XenForo push sẵn (`service_worker.js`, `enablePush:true`, `pushAppServerKey`). Hai rào cản cũ: `_xfToken` + `xf_session` chỉ sống trong phiên HTML của voz.vn (TuiVoz dùng OAuth Bearer, không có cookie session).
- **`/forum/*` proxy** (`handleForumProxy` trong `api/handler.js`, port từ `vercel-proxy`): full-page proxy `voz.vn` cùng origin → rebind `Set-Cookie` (`xf_session`/`xf_user`/`xf_csrf`) về domain TuiVoz, rewrite `https://voz.vn`→`/forum`, inject `<base href="/forum/">`, strip CF headers + `accept-encoding`. Đây là chỗ **login forum lần đầu** (`/forum/login/`) để có `xf_session`.
- **Subscribe flow** (`lib/push.js`): `fetchPushConfig()` scrape `XF.config.csrf`+`userId`+`pushAppServerKey` từ `/forum/index.php` → `pushManager.subscribe({applicationServerKey: <voz VAPID>})` → POST `application/x-www-form-urlencoded` tới `/forum/index.php?misc/update-push-subscription` với `{endpoint,key(p256dh),token(auth),encoding,unsubscribed:0,_xfToken}`. `key`/`token` gửi **base64 thường** (`btoa`, có `=` padding — giống `XF.Push.updateUserSubscription` trong `core.js`; KHÔNG dùng base64url, PHP `base64_decode` sẽ corrupt key có `-`/`_`); `encoding` = `PushManager.supportedContentEncodings[0]` (fallback `aesgcm`). Endpoint của browser thuộc domain TuiVoz → push vẫn về SW của TuiVoz. Toggle-off POST `unsubscribed:1` + `sub.unsubscribe()`.
- **SW** (`sw.js`): thêm `push` (parse `{title,body,dir,icon,badge,total_unread}` → `showNotification` + `setAppBadge`) và `notificationclick` (`data.url` rewrite `voz.vn`→same-origin rồi `navigate`/`openWindow`).
- **UI**: toggle "Nhận thông báo voz" trong `/cai-dat-tuivoz#system` (setting `pushEnabled`, chỉ UI state — trạng thái thật check qua `pushManager.getSubscription()`). Hint "Cần đăng nhập voz qua proxy forum…" chỉ hiện khi `fetchPushConfig()` (export từ `push.js`, cache 30s) báo `userId === 0` — đã login proxy thì ẩn. Lỗi map: `guest` → chưa login qua `/forum`; `denied` → browser chặn; `browser` → `pushManager.subscribe()` fail phía browser (voz chưa được gọi); `upstream` → voz từ chối.
- **Lỗi browser `AbortError "Error retrieving push subscription."`**: DOMException của **Firefox** (`Push.sys.mjs`) khi autopush (push.services.mozilla.com) tắt/không kết nối được — Camoufox/hardened Firefox tắt sẵn (`dom.push.enabled=false`). Reproduced trên Camoufox local. Không phải lỗi code/proxy; user phải dùng trình duyệt push-enabled (Chrome/Edge/Firefox gốc bật `dom.push.enabled`). Chrome ẩn danh cũng không hỗ trợ Push (`NotAllowedError`).
- **HTML rewrite**: ngoài `voz.vn`→`/forum`, còn rewrite **root-relative** `src/href/action/formaction/poster/data-*` (`="/` → `="/forum/`), từng URL trong `srcset`, và **`XF.config`**: brace-match toàn bộ object `XF.config = {…}` rồi rewrite **mọi** string root-relative bên trong → `/forum/…` (`'/` → `'/forum/`, skip `//` và `/local://` marker của XF) + key map js/css dạng escaped `{"\/js\/xf\/…"}` → `{"\/forum\/js\/xf\/…"}`. Không dùng whitelist key vì `url` là object lồng (`"url":{"css":…}` chứ không phải `url.css:`) và còn nhiều template ẩn (`url.alert` = popup thông báo, `url.iconBadge`/`contentTitle` = badge counter trên top bar mobile — thiếu → top bar trống trơn khi đã login). Trước đây các template trỏ `/js/…` `/css.php` trốn khỏi `/forum` → 404 về `index.html` → `SyntaxError` → `XF` undefined → trang login chết. `fullBase` là absolute nên `replaceAll(SITE)` đã lo.
- **Gotcha**: subscribe endpoint là POST form (XenForo `XF.ajax`), **không** phải REST JSON. Chỉ test được trên deploy (Vercel `sin1` bypass Cloudflare **khi** UA giống browser — curl UA vẫn bị challenge); local VN IP bị chặn HTML mọi path.

### §7.8 Login OAuth một-chạm qua proxy (không userscript)
- **Session persistence (sliding, không cần login lại)**: `voz_session` cookie được re-issue trên MỌI response `/api/xf/*` và `/api/oauth/status` (Max-Age 30d reset mỗi request — giống session lăn của XenForo). `refresh_token` vẫn tự renew khi access hết hạn. Phía forum, `session.js` chạy `startForumKeepAlive()` sau `loadSession()`: ping `GET /forum/login/keep-alive` (XHR) mỗi 60s + khi tab visible lại — giữ `xf_session`/`xf_user` sống giống voz.vn tự làm (voz cũng ping ~60s). Chỉ mất login khi revoke token, xoá cookie, hoặc >30 ngày không mở app.
`redirect_uri` của client vẫn cố định `vozma26://oauth` (custom scheme app — trang web không bắt được, nên trước đây phải copy code tay). Proxy `/forum` giờ tự capture:
- **Flow**: `/login` bấm "Đăng nhập với voz.vn" → `makePkce()` + lưu `{verifier,state}` vào `sessionStorage.voz_pkce` → `location.href = /forum/oauth2/authorize?…redirect_uri=vozma26://oauth…` (qua proxy, kế thừa `xf_session`; chưa login voz thì form login của voz hiện trong luồng) → user bấm **Authorize** → voz `302 Location: vozma26://oauth?code=…&state=…` → `handleForumProxy` detect `u.protocol === 'vozma26:'` → rewrite `Location` thành `proxyOrigin + '/oauth-callback' + u.search` → SPA route `/oauth-callback` → `viewOauthCallback` đọc `code`+`state`, check state khớp PKCE → `/api/oauth/exchange` → `navigate('/')`.
- **`vercel.json`**: catch-all SPA đã gửi `/oauth-callback` → `index.html` (không cần route mới).
- **`/login` còn `<details>` "Cách cũ"**: userscript/popup + paste code (fallback nếu proxy OAuth hỏng) — vẫn `redirect_uri` + PKCE như cũ, mở `authorizeUrl` **trực tiếp** voz.vn (`proxied:false`).
- **Lưu ý**: `Location` rewrite có 2 nhánh — `vozma26:` → `/oauth-callback`; `host===voz.vn` → `/forum<path>` (giữ nguyên). XenForo trả cả absolute + relative Location, `new URL(location, SITE)` normalize hết.

## 2025 — Chế độ ẩn danh (anonMode)

- Cài đặt mới trong **Hệ thống**: `anonMode` = `'off'` (Tắt, default) / `'hide'` (Bật) / `'mimic'` (Tự chọn).
- `assets/lib/anon.js` — core: `displayUser(me)` trả user để hiển thị — `'hide'` → stub `{user_id:0, username:'?', avatar_urls:{}}`; `'mimic'` → record đã lưu; else `me`. `parseProfileInput()` nhận URL profile `/members/name.123/` (lấy id số), id số thuần, hoặc username thường. `resolveMimicUser()` resolve thành `{user_id, username, avatar_urls}`.
- **`api.findUser` trả `{exact}` không phải `{users}`**: XF `GET /users/find-name` trả `exact` object khi khớp tên, `recommendations` array nếu không — đừng đọc `found.users` (luôn undefined → "not found" sai).
- `'hide'`: top bar ẩn username + avatar (letter `?`), quick-reply column (`thread.js` `quickReplyUserHtml`) hiển thị span không link + avatar `?`. `'mimic'`: hiển thị tên + avatar của member kia, link trỏ profile mimic.
- `anonMimic` lưu normalize qua `normalizeAnonMimic()` trong `lib/settings.js` — chỉ giữ `user_id` số, `username` string, `avatar_urls` https.
- UI settings: `optionCards('anon-mode', …)` + `#anon-mimic-row` ẩn/hiện theo radio; `wireAnonMimicInput()` resolve lúc change/Enter với race-ticket (gõ nhanh không đè kết quả), status ✓/⚠. Input không resolve được → **giữ mimic cũ**, không xoá.
- `chrome.js` `renderAccount()` dùng `displayUser(me)`; menu account `h2` hiển thị tên thật kèm `(ẩn danh)` khi anon đang bật (để user biết mình đang bật chế độ này). Re-render khi `voz:settings` event fire.
- Test browser logged-out không render được top bar/quick-reply thật — verify `displayUser()` bằng mock `state.me` trong console.

- **2026-11-25 fix**: dropdown account menu `<h2>` hiển thị `shown.username` (không phải real username), bỏ hoàn toàn marker `(ẩn danh)` — ẩn danh không để lại dấu vết nào trong UI. Link "Hồ sơ" trong menu vẫn trỏ profile thật (`userPath(me)`).

- **2026-11-25 fix 2**: hide mode không dùng `?` nữa — `HIDDEN_USER` giờ là `{user_id:0, username:'User'}` + avatar là favicon app `/assets/img/voz-icon-192.png` (path local nên `imgSrc()` pass-through, không qua proxy). Quick-reply aria-label đổi từ `Ẩn danh` → `shown.username` (ẩn danh tuyệt đối, kể cả screen reader).

- **2026-11-25 fix 3**: nền xanh lá (fallback initial màu) lộ qua góc trong suốt của voz icon → `avatarMarkup()` giờ detect placeholder (userless + có image) → background transparent, bỏ initial. Guest thật (userless, không image) vẫn giữ initial như cũ.

## 2025 — anonHideReply (ẩn khung trả lời)

- Toggle **"Ẩn toàn bộ khung trả lời"** nằm trong row `#anon-hide-reply-row` — chỉ hiện khi `anonMode === 'hide'` (tương tự mimic-row chỉ hiện khi mimic). Lý do: viết bài khi ẩn danh lập tức lộ tài khoản thật.
- Key `anonHideReply` (bool, default false): emptySettings + normalize + `setAnonHideReply()` + export payload.
- `lib/anon.js` export `hideQuickReply()` = `anonMode==='hide' && anonHideReply===true`; `views/thread.js` render `#reply-block` rỗng khi true (tắt hẳn cả nhánh "không thể trả lời" — không lộ gì).
- Thread không re-render live khi đổi setting — chỉ áp dụng lần load thread sau (đủ cho use case).

## 2025 — Multi-account login + JSON redirect fix

### Multi-account (cookie format mới)
- Cookie `voz_session` giờ là `{ active: "<userId>", accounts: { "<userId>": tokens+identity } }` thay vì tokens phẳng. Legacy cookie auto-migrate: key `_legacy` → re-key sang user_id thật khi `/oauth/status` fetchMe thành công.
- Mỗi account slot cache thêm `username` + `avatar_urls` (chỉ size s/m — giữ cookie < 3800 bytes, tránh browser drop cookie > 4KB). `MAX_ACCOUNTS = 8`.
- Endpoints: `/api/oauth/switch` POST `{user_id}` → set active, refresh nếu sắp hết hạn, trả me. `/api/oauth/logout` POST `{user_id}` → xoá 1 account + revoke token riêng, promote account đầu còn lại; không body → logout hết (revoke từng account). `/exchange` upsert vào map + set active (login lại cùng account = update tokens). `/status` trả thêm `accounts: [{user_id, username, avatar_urls}]`.
- `handleProxy` nhận session object: refresh → merge tokens vào slot active → reissue cookie full session (sliding như cũ, nhưng chỉ nếu `sessionFitsCookie`).
- Client: `state.accounts` trong dom.js; switcher trong account menu (`chrome.js`) — click row switch (sau đó `location.reload()` vì unread/reactions per-user), nút × xoá account không-active, link "+ Thêm tài khoản" → /login. Nút Đăng xuất chính giờ logout **active account thôi** (promote survivor + reload), không phải xoá hết.
- `auth.logout(userId)` trả `{loggedOut: bool}`; `auth.switchAccount(userId)` trả `{ok, me}`.
- `login.js`: khi đã login hiện hướng dẫn "mở /forum/ → đăng xuất → đăng nhập account mới ở đó → quay lại bấm Đăng nhập" (voz authorize auto-approve theo xf_session đang có). `finishLogin` dùng `location.href='/'` thay navigate (hard reload đọc lại accounts).
- **Push notification**: vẫn gắn account lúc subscribe — switch account không đổi push sub.

### JSON redirect escape fix (lỗi /logout trên host gốc)
- **Root cause**: XF route-filter rewrite URL thân thiện — `/logout` hiển thị là `/dang-xuat` nhưng redirect nội bộ (303/JSON) dùng route gốc `logout`. POST logout qua overlay trả JSON `{"redirect":"\/"}` hoặc `{"redirect":"\/logout"}` — root-relative path trong JSON không được rewrite → browser thoát khỏi proxy `/forum/`, rơi vào SPA host (ví dụ tuivoz.vercel.app/logout) → route không tồn tại.
- Fix: trong `handleForumProxy`, với `application/json` rewrite key `redirect`/`redirectUrl` root-relative → prefix `/forum`. PHP `json_encode` escape slash (`\/logout`) nên cần 2 pass: escaped `\\/` trước rồi plain `/` (test bằng temp node script, pass 9 case).
- Absolute `https://voz.vn/...` trong JSON đã được cover sẵn bởi `replaceAll(SITE, …)`.

## 2025 — /forum/ proxy URL-escape fix (icons, fonts, keep-alive "Oops")

Triệu chứng: icon FontAwesome trong top bar biến mất (mobile+desktop), font bị sanitizer reject, `SyntaxError: expected expression, got '<'`, và overlay **"Oops! We ran into some problems"** xuất hiện khi switch tab rồi quay lại. Tất cả cùng một họ bug: URL root-relative trong `/forum/` escape khỏi proxy, rơi vào SPA fallback (index.html / 405).

Ba lỗi rewrite trong `handleForumProxy` (api/handler.js):

1. **XF.config rewrite không bao giờ match.** Markup thật của XF là `XF.extendObject(true, XF.config, {…})`, không phải `XF.config = {…}` như code giả định → `basePath`, `url.keepAlive` (`/login/keep-alive`), `url.js`, `url.iconInline` và các key escaped `\/js\/…` trong js-map không được rewrite → keep-alive ping trúng SPA host → 405 → XF hiện overlay lỗi; dynamic scripts load index.html → SyntaxError. Fix: regex `XF\.config\s*(?:,|=)\s*\{` chấp nhận cả hai dạng.
2. **`text/css` thiếu trong isText** → CSS không rewrite. voz serve CSS từ `css.php` (file ở site root) nên cả `url(/styles/…)` root-relative lẫn `url(../styles/…)`/bare-relative đều resolve về `/` của host SPA → escape. Fix: rewrite `url()` trong CSS — absolutize relative theo base upstream trước (giữ nguyên query string `?v=…`), prefix `/forum`; bỏ qua `https:`, `data:`, `#`, `//`, và url rỗng.
3. **`window.vozSignals={"e":"/xfes.php"}`** inline script — analytics/keep-alive POST escape → 405. Fix: rewrite targeted theo prefix `vozSignals` (không rewrite generic inline script vì sẽ corrupt template HTML).

Không cần bump sw.js — toàn bộ fix server-side. Verify sau deploy trên prod: icon top bar hiện lại, không còn SyntaxError/font reject, switch tab không còn overlay Oops (keep-alive POST `/forum/login/keep-alive` → 200).

## 2025 — JSON overlay rewrite (login form action)

Login trên `/forum/` submit tới `/login/login` (thiếu `/forum`) → 405 redirect error. Nguyên nhân: form login (và mọi overlay XF: lightbox, menu dropdown, reaction…) load qua AJAX `_xfResponseType=json` — response JSON chứa HTML nhúng dạng `"html":{"content":"<form action=\"\/login\/login\" …"}`; rewrite trước chỉ xử lý key `redirect` nên attribute root-relative trong HTML nhúng escape khỏi proxy. Fix (api/handler.js): thêm 2 pass regex rewrite cho `(src|href|action|formaction|poster|data-src|data-url)=\"` trong body JSON — cả dạng PHP-escaped `\"\/` lẫn unescaped `\"/`, idempotent với path đã có `/forum/`. Attribute không nằm trong danh sách (vd `data-xf-click`) và string không phải attribute không bị đụng. 8 unit-test pass. Server-side only, không cần bump sw.js.

## 2025 — account.css unscoped selector bug + multi-account verified

**Bug:** rule `.memberHeader-buttons a[href^="https://voz.vn"], a[href^="/forum/"]` — selector thứ 2 sau dấu phẩy mất scope `.memberHeader-buttons` → mọi link `/forum/` trong toàn app (kể cả link hướng dẫn thêm tài khoản trong trang login) bị `display:none`. Sửa cả 3 chỗ thành `, .memberHeader-buttons a[href^="/forum/"]`.

**Multi-account verified end-to-end trên prod (2025-11-26):** OAuth thêm tài khoản thứ 2 (salin1810 sau Fioren) upsert đúng; switcher hiển thị 2 accounts với ✓ active / × remove / "+ Thêm tài khoản"; switch click → reload → active đổi, header cập nhật; Đăng xuất account active → drop đúng account đó, account còn lại được promote active.

## 2025 — login instructions split first-login vs add-account

Block hướng dẫn first-login ("Nhấn Đăng nhập với voz.vn → điều hướng tới proxy → đăng nhập → bấm thêm lần nữa") giờ chỉ hiện khi **chưa** có account nào (`addingAccount` false); khi thêm tài khoản chỉ hiện block hướng dẫn multi-account. Viết lại text gọn hơn (3 bước). Bump sw.js v28→v29.

### §7.9 Link `/goto/post?id=N` qua proxy bị voz chặn
Triệu chứng: link `voz.vn/goto/post?id=X` trong post/alert/push được `rewriteVozLinks` đẩy qua `/forum/goto/post?id=X` (không có route SPA local) → request HTML hop redirect qua proxy bị voz/Cloudflare chặn; cùng link dạng `/p/X/` thì ok vì đi SPA REST API.
- `postLinks.js`: helper `gotoPostPath` — `/goto/post?id=N` (có/không trailing slash) → `/p/N/`; `localPathFor` check ngay sau `VOZ_ONLY_SUFFIXES`, trước `LOCAL_PREFIXES` (goto không nằm trong prefix list).
- `router.js`: route trực tiếp `head === 'goto' && segments[1] === 'post' && id số` → `navigate('/p/N/', {replace:true})` (phòng khi link dán thẳng vào app).
- `sw.js` `notificationclick`: push payload có `url=voz.vn/goto/post?id=N` → mở `/p/N/` thay vì trang voz; bump CACHE v35→v36. `lists.js` + `headerMenus.js` fallback `alert_url` cũng rewrite `/goto/post?id=N` → `/p/N/`.
- Gotcha: `/goto/post` hop redirect là HTML, proxy `/forum` chỉ sống sót với REST; mọi permalink dạng redirect của voz phải fold vào route SPA tương ứng ngay ở tầng link.

### §7.10 Lệch số trang giữa thanh phân trang dưới và infinite-scroll sentinel
Triệu chứng: ở trang 1 (chế độ `manual`), thanh phân trang highlight `1` nhưng dòng `.infinite-sentinel` ngay dưới lại hiển thị `Trang 2 / N`, và khi cuộn vô hạn nối trang mới thanh phân trang dưới vẫn kẹt ở `1`.
- `infiniteScroll.js`: `label()` idle dùng `state.page` thay vì `state.page + 1`; `loadNext()` cập nhật `state.lastPage` và truyền `{ lastPage, armed }` qua `onPageAppended`.
- `pagination.js`: thêm `updatePager()` + `scrollArmed` option để giữ trạng thái nút cuộn; guard `dataset.wired` trong `wirePageJump` tránh gán trùng listener lên thanh phân trang trên.
- `views/thread.js`, `views/forum.js`: truyền `onPageAppended` gọi `updatePager(#pager-slot)` và cập nhật `document.title`. Bump `sw.js` `tv-static-v38`→`v39`.

### §7.11 Spoiler API placeholder bản địa hoá theo ngôn ngữ → restoreSpoilers miss
Triệu chứng: post chỉ hiện `Nội dung spoiler đã bị ẩn.` không click mở được — `[SPOILER]…[/SPOILER]` bị giấu hẳn.
- Nguyên nhân: upstream XenForo API trả `<div>Nội dung spoiler đã bị ẩn.</div>` (tiếng Việt) cho guest key, trong khi `spoilers.js` `restoreSpoilers` chỉ match chuỗi Anh `'Spoiler content hidden.'` → `placeholders.length !== spoilers.length` → bỏ qua restore. Ngôn ngữ placeholder phụ thuộc upstream (không ổn định) nên hiện tượng "localhost chạy / Vercel hỏng" (hoặc ngược lại) chỉ là lúc upstream trả en vs vi, không phải khác biệt local/Vercel.
- Fix: match placeholder **không phụ thuộc ngôn ngữ** — leaf `<div>` text ngắn (<200 ký tự) chứa `spoiler` case-insensitive; guard thật vẫn là count-equality với số `[spoiler]` trong raw bbcode (post viết tay có chữ "spoiler" một mình không lệch count vì số div ≠ số tag spoiler).
- Verify: post 44499707 thread 1302974 (`[SPOILER]NYKD-54[/SPOILER]`) giờ render `<details class="post-spoiler"><summary>Spoiler</summary>NYKD-54</details>` đúng như voz.vn.
- Bump `sw.js` `tv-static-v39`→`v40` (bắt buộc vì `lib/` nằm trong CACHEABLE).
