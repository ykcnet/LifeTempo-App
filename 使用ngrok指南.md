# 使用 ngrok 快速在手机上测试

## 什么是 ngrok？
ngrok 是一个安全的内网穿透工具，可以将本地服务器暴露到公网，让您可以从任何地方访问。

## 步骤

### 1. 下载 ngrok
访问 https://ngrok.com/download 下载 Windows 版本
解压到任意文件夹（例如 C:\ngrok）

### 2. 注册并获取认证令牌
1. 访问 https://ngrok.com/signup 注册免费账号
2. 登录后，在 Dashboard 可以看到 Your Authtoken
3. 复制这个 token（类似：2abc123def456...）

### 3. 配置 ngrok
打开命令提示字元（CMD）或 PowerShell：
```bash
cd C:\ngrok
ngrok config add-authtoken YOUR_TOKEN
```
将 YOUR_TOKEN 替换为您复制的 token

### 4. 启动隧道
```bash
ngrok http 4173
```

### 5. 复制公网地址
ngrok 会显示类似这样的信息：
```
Forwarding  https://abc123.ngrok.io -> http://localhost:4173
```
复制 `https://abc123.ngrok.io` 这个地址

### 6. 在手机浏览器访问
在手机浏览器中输入复制的地址：
```
https://abc123.ngrok.io
```

### 7. 安装为应用
按照正常的 PWA 安装步骤安装即可

## 优势
✅ 不需要配置防火墙
✅ 不需要同一 WiFi 网络
✅ 可以在任何地方访问
✅ 免费版足够个人使用

## 注意事项
- ngrok 免费版地址每次启动都会变化
- 如果需要固定地址，需要付费订阅
- 确保电脑保持开机和 ngrok 保持运行
