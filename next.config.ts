/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",   // 静态导出，兼容 Gitee Pages
  images: {
    unoptimized: true, // 静态环境无需 Next.js 图片优化服务
  },
};

export default nextConfig;
