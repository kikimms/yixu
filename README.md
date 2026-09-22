# 衣序 YIXU Online

这是衣序的线上版副本，目标是做成面试官可以打开体验的私密演示版。

本地版仍在 `../wardrobe`，不受这个目录影响。

## 你需要注册的账号

1. Supabase：负责登录、数据库、图片存储。
2. Vercel：负责发布网页，生成公网链接。
3. GitHub：推荐用来把代码连接到 Vercel。

## Supabase 设置

1. 登录 Supabase，新建一个 Project。
2. 打开 SQL Editor。
3. 复制 `supabase/schema.sql` 的全部内容并运行。
4. 打开 Project Settings -> API，复制：
   - Project URL
   - anon public key
5. 打开 Authentication -> Providers，先保留 Email 登录即可。

## 本地环境变量

复制 `.env.example` 为 `.env.local`，填入：

```bash
VITE_SUPABASE_URL=https://你的项目编号.supabase.co
VITE_SUPABASE_ANON_KEY=你的 Supabase anon public key
VITE_SUPABASE_BUCKET=wardrobe
```

## Vercel 环境变量

在 Vercel 项目设置里添加同样三个变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_BUCKET`

不要把 `.env.local` 上传到 GitHub。这个文件已经被 `.gitignore` 忽略，Vercel 上要在项目设置里手动填写环境变量。

## 运行

```bash
npm install
npm run dev
```

## 部署

Vercel 连接这个目录所在的仓库后：

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

如果仓库根目录不是 `wardrobe-online`，Vercel 里把 Root Directory 设置成 `wardrobe-online`。
