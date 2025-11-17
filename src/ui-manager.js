import { existsSync, readFileSync, writeFileSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import { getRequestBody, MODEL_PROVIDER } from './common.js';
import { CONFIG } from './config-manager.js';

/**
 * 获取提供商数组（兼容新旧格式）
 * @param {Array|Object} poolData - 提供商池数据
 * @returns {Array} 提供商数组
 */
function getProvidersArray(poolData) {
  if (!poolData) return [];
  return Array.isArray(poolData) ? poolData : (poolData.providers || []);
}

/**
 * 设置提供商数组（兼容新旧格式）
 * @param {Object} providerPools - 提供商池对象
 * @param {string} providerType - 提供商类型
 * @param {Array} providers - 提供商数组
 */
function setProvidersArray(providerPools, providerType, providers) {
  const poolData = providerPools[providerType];
  if (poolData && !Array.isArray(poolData) && typeof poolData === 'object') {
    // 对象格式，更新 providers 字段
    poolData.providers = providers;
  } else {
    // 数组格式或新建，直接赋值
    providerPools[providerType] = providers;
  }
}

// Token存储在内存中（生产环境建议使用Redis）
const tokenStore = new Map();

/**
 * 生成简单的token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成token过期时间
 */
function getExpiryTime() {
    const now = Date.now();
    const expiry = 60 * 60 * 1000; // 1小时
    return now + expiry;
}

/**
 * 验证简单token
 */
function verifyToken(token) {
    const tokenInfo = tokenStore.get(token);
    if (!tokenInfo) {
        return null;
    }
    
    // 检查是否过期
    if (Date.now() > tokenInfo.expiryTime) {
        tokenStore.delete(token);
        return null;
    }
    
    return tokenInfo;
}

/**
 * 清理过期的token
 */
function cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, info] of tokenStore.entries()) {
        if (now > info.expiryTime) {
            tokenStore.delete(token);
        }
    }
}

/**
 * 读取密码文件内容
 */
async function readPasswordFile() {
    try {
        const password = await fs.readFile('./pwd', 'utf8');
        return password.trim();
    } catch (error) {
        console.error('读取密码文件失败:', error);
        return null;
    }
}

/**
 * 验证登录凭据
 */
async function validateCredentials(password) {
    const storedPassword = await readPasswordFile();
    return storedPassword && password === storedPassword;
}

/**
 * 解析请求体JSON
 */
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (!body.trim()) {
                    resolve({});
                } else {
                    resolve(JSON.parse(body));
                }
            } catch (error) {
                reject(new Error('无效的JSON格式'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * 检查token验证
 */
function checkAuth(req) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }

    const token = authHeader.substring(7);
    const tokenInfo = verifyToken(token);
    
    return tokenInfo !== null;
}

/**
 * 处理登录请求
 */
async function handleLoginRequest(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '仅支持POST请求' }));
        return true;
    }

    try {
        const requestData = await parseRequestBody(req);
        const { password } = requestData;
        
        if (!password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: '密码不能为空' }));
            return true;
        }

        const isValid = await validateCredentials(password);
        
        if (isValid) {
            // 生成简单token
            const token = generateToken();
            const expiryTime = getExpiryTime();
            
            // 存储token信息
            tokenStore.set(token, {
                username: 'admin',
                loginTime: Date.now(),
                expiryTime
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: '登录成功',
                token,
                expiresIn: '1小时'
            }));
        } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: '密码错误，请重试'
            }));
        }
    } catch (error) {
        console.error('登录处理错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            message: error.message || '服务器错误'
        }));
    }
    return true;
}

// 定时清理过期token
setInterval(cleanupExpiredTokens, 5 * 60 * 1000); // 每5分钟清理一次

// 配置multer中间件
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            // multer在destination回调时req.body还未解析，先使用默认路径
            // 实际的provider会在文件上传完成后从req.body中获取
            const uploadPath = path.join(process.cwd(), 'configs', 'temp');
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitizedName}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.json', '.txt', '.key', '.pem', '.p12', '.pfx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    }
});

/**
 * Serve static files for the UI
 * @param {string} path - The request path
 * @param {http.ServerResponse} res - The HTTP response object
 */
export async function serveStaticFiles(pathParam, res) {
    // Handle models.json specially - it's in the root directory
    if (pathParam === '/models.json') {
        const modelsConfigPath = path.join(process.cwd(), 'models.json');
        if (existsSync(modelsConfigPath)) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(readFileSync(modelsConfigPath, 'utf-8'));
            return true;
        }
        return false;
    }
    
    const filePath = path.join(process.cwd(), 'static', pathParam === '/' || pathParam === '/index.html' ? 'index.html' : pathParam.replace('/static/', ''));

    if (existsSync(filePath)) {
        const ext = path.extname(filePath);
        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.ico': 'image/x-icon'
        }[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(readFileSync(filePath));
        return true;
    }
    return false;
}

/**
 * Handle UI management API requests
 * @param {string} method - The HTTP method
 * @param {string} path - The request path
 * @param {http.IncomingMessage} req - The HTTP request object
 * @param {http.ServerResponse} res - The HTTP response object
 * @param {Object} currentConfig - The current configuration object
 * @param {Object} providerPoolManager - The provider pool manager instance
 * @returns {Promise<boolean>} - True if the request was handled by UI API
 */
export async function handleUIApiRequests(method, pathParam, req, res, currentConfig, providerPoolManager) {
    // 处理登录接口
    if (method === 'POST' && pathParam === '/api/login') {
        const handled = await handleLoginRequest(req, res);
        if (handled) return true;
    }

    // 健康检查接口（用于前端token验证）
    if (method === 'GET' && pathParam === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        return true;
    }
    
    // Ollama API endpoints that should NOT require UI token authentication
    const ollamaEndpoints = ['/api/tags', '/api/show', '/api/chat', '/api/generate', '/api/version', '/api/models'];
    const isOllamaEndpoint = ollamaEndpoints.includes(pathParam);
    
    // Handle UI management API requests (需要token验证，除了登录接口、健康检查、Events接口和Ollama接口)
    if (pathParam.startsWith('/api/') &&
        pathParam !== '/api/login' &&
        pathParam !== '/api/health' &&
        pathParam !== '/api/events' &&
        !isOllamaEndpoint) {
        // 检查token验证
        if (!checkAuth(req)) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end(JSON.stringify({
                error: {
                    message: '未授权访问，请先登录',
                    code: 'UNAUTHORIZED'
                }
            }));
            return true;
        }
    }

    // 文件上传API - 上传后自动添加到 provider.json
    if (method === 'POST' && pathParam === '/api/upload-oauth-credentials') {
        const uploadMiddleware = upload.single('file');
        
        uploadMiddleware(req, res, async (err) => {
            if (err) {
                console.error('文件上传错误:', err.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: err.message || '文件上传失败'
                    }
                }));
                return;
            }

            try {
                if (!req.file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: {
                            message: '没有文件被上传'
                        }
                    }));
                    return;
                }

                // multer执行完成后，表单字段已解析到req.body中
                let provider = req.body.provider || 'common';
                const providerType = req.body.providerType; // 从前端传递的提供商类型
                const isEditMode = req.body.isEditMode === 'true'; // 判断是否为编辑模式
                const oldFilePath = req.body.oldFilePath; // 编辑模式下的旧文件路径
                const tempFilePath = req.file.path;
                
                console.log('[UI API] File upload parameters:', {
                    provider,
                    providerType,
                    isEditMode,
                    oldFilePath,
                    fileName: req.file.filename
                });
                
                // 使用providerType映射正确的文件夹名（对应前端 getProviderKey 逻辑）
                const providerMapping = {
                    'gemini-cli-oauth': 'gemini',
                    'claude-kiro-oauth': 'kiro',
                    'openai-qwen-oauth': 'qwen'
                };
                if(providerType && providerMapping[providerType]){
                    provider = providerMapping[providerType];
                }
                
                // 根据实际的provider移动文件到正确的目录
                const targetDir = path.join(process.cwd(), 'configs', provider);
                await fs.mkdir(targetDir, { recursive: true });
                
                let targetFilePath;
                let relativePath;
                
                // 编辑模式：替换旧文件
                if (isEditMode && oldFilePath) {
                    const oldFullPath = path.join(process.cwd(), oldFilePath);
                    
                    // 使用旧文件的名称
                    const oldFileName = path.basename(oldFilePath);
                    targetFilePath = path.join(targetDir, oldFileName);
                    
                    // 删除旧文件（如果存在）
                    if (existsSync(oldFullPath)) {
                        try {
                            await fs.unlink(oldFullPath);
                            console.log(`[UI API] Deleted old file: ${oldFullPath}`);
                        } catch (unlinkError) {
                            console.warn(`[UI API] Failed to delete old file: ${unlinkError.message}`);
                        }
                    }
                    
                    // 移动新文件到旧文件的位置
                    await fs.rename(tempFilePath, targetFilePath);
                    relativePath = oldFilePath; // 保持相同的相对路径
                    
                    console.log(`[UI API] Replaced file in edit mode: ${relativePath}`);
                } else {
                    // 新增模式：使用时间戳命名
                    targetFilePath = path.join(targetDir, req.file.filename);
                    await fs.rename(tempFilePath, targetFilePath);
                    relativePath = path.relative(process.cwd(), targetFilePath);
                }

                // 智能判断：只在"添加新提供商"模式下自动保存到 provider.json
                let addedToPool = false;
                let providerConfig = null;
                
                if (providerType && !isEditMode) {
                    try {
                        // 生成 UUID
                        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            const r = Math.random() * 16 | 0;
                            const v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });

                        // 根据提供商类型创建配置
                        providerConfig = {
                            uuid: uuid,
                            checkModelName: '',
                            checkHealth: false,
                            isHealthy: true,
                            isDisabled: false,
                            lastUsed: null,
                            usageCount: 0,
                            errorCount: 0,
                            lastErrorTime: null
                        };

                        // 根据提供商类型添加对应的凭据路径字段
                        switch (providerType) {
                            case 'gemini-cli-oauth':
                                providerConfig.GEMINI_OAUTH_CREDS_FILE_PATH = relativePath;
                                providerConfig.PROJECT_ID = '';
                                break;
                            case 'claude-kiro-oauth':
                                providerConfig.KIRO_OAUTH_CREDS_FILE_PATH = relativePath;
                                break;
                            case 'openai-qwen-oauth':
                                providerConfig.QWEN_OAUTH_CREDS_FILE_PATH = relativePath;
                                break;
                            default:
                                console.warn(`[UI API] 未知的提供商类型: ${providerType}，文件已上传但未自动添加到 provider.json`);
                        }

                        // 只有在识别的提供商类型时才添加到池中
                        if (providerConfig.GEMINI_OAUTH_CREDS_FILE_PATH ||
                            providerConfig.KIRO_OAUTH_CREDS_FILE_PATH ||
                            providerConfig.QWEN_OAUTH_CREDS_FILE_PATH) {
                            
                            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
                            let providerPools = {};
                            
                            // 加载现有池
                            if (existsSync(filePath)) {
                                try {
                                    const fileContent = readFileSync(filePath, 'utf8');
                                    providerPools = JSON.parse(fileContent);
                                } catch (readError) {
                                    console.warn('[UI API] 读取现有 provider.json 失败:', readError.message);
                                }
                            }

                            // 添加新提供商到相应类型
                            const providers = getProvidersArray(providerPools[providerType]);
                            providers.push(providerConfig);
                            setProvidersArray(providerPools, providerType, providers);

                            // 保存到文件
                            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
                            console.log(`[UI API] 已自动添加新提供商到 ${providerType}: ${providerConfig.uuid}`);

                            // 更新 provider pool manager
                            if (providerPoolManager) {
                                providerPoolManager.providerPools = providerPools;
                                providerPoolManager.initializeProviderStatus();
                            }

                            // 更新 CONFIG 缓存
                            CONFIG.providerPools = providerPools;

                            addedToPool = true;

                            // 广播提供商更新事件
                            broadcastEvent('provider_update', {
                                action: 'add',
                                providerType,
                                providerConfig,
                                timestamp: new Date().toISOString()
                            });
                        }
                    } catch (poolError) {
                        console.error('[UI API] 自动添加到 provider.json 失败:', poolError.message);
                        // 文件已上传成功，但添加到池失败，继续返回成功响应
                    }
                }

                // 广播文件更新事件
                broadcastEvent('config_update', {
                    action: 'add',
                    filePath: relativePath,
                    provider: provider,
                    providerType: providerType,
                    addedToPool: addedToPool,
                    timestamp: new Date().toISOString()
                });

                console.log(`[UI API] OAuth凭据文件已上传: ${targetFilePath} (提供商: ${provider}${addedToPool ? ', 已自动添加到 provider.json' : ''})`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: addedToPool ? '文件上传成功并已自动添加到凭据池' : '文件上传成功',
                    filePath: relativePath,
                    originalName: req.file.originalname,
                    provider: provider,
                    providerType: providerType,
                    addedToPool: addedToPool,
                    providerConfig: addedToPool ? providerConfig : null
                }));

            } catch (error) {
                console.error('文件上传处理错误:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: '文件上传处理失败: ' + error.message
                    }
                }));
            }
        });
        return true;
    }

    // Get configuration
    if (method === 'GET' && pathParam === '/api/config') {
        let systemPrompt = '';

        if (currentConfig.SYSTEM_PROMPT_FILE_PATH && existsSync(currentConfig.SYSTEM_PROMPT_FILE_PATH)) {
            try {
                systemPrompt = readFileSync(currentConfig.SYSTEM_PROMPT_FILE_PATH, 'utf-8');
            } catch (e) {
                console.warn('[UI API] Failed to read system prompt file:', e.message);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...currentConfig,
            systemPrompt
        }));
        return true;
    }

    // Update configuration
    if (method === 'POST' && pathParam === '/api/config') {
        try {
            const body = await getRequestBody(req);
            const newConfig = body;

            // Update config values in memory - ONLY basic config, NO key/auth fields
            if (newConfig.REQUIRED_API_KEY !== undefined) currentConfig.REQUIRED_API_KEY = newConfig.REQUIRED_API_KEY;
            if (newConfig.HOST !== undefined) currentConfig.HOST = newConfig.HOST;
            if (newConfig.SERVER_PORT !== undefined) currentConfig.SERVER_PORT = newConfig.SERVER_PORT;
            if (newConfig.SYSTEM_PROMPT_FILE_PATH !== undefined) currentConfig.SYSTEM_PROMPT_FILE_PATH = newConfig.SYSTEM_PROMPT_FILE_PATH;
            if (newConfig.SYSTEM_PROMPT_MODE !== undefined) currentConfig.SYSTEM_PROMPT_MODE = newConfig.SYSTEM_PROMPT_MODE;
            if (newConfig.PROMPT_LOG_BASE_NAME !== undefined) currentConfig.PROMPT_LOG_BASE_NAME = newConfig.PROMPT_LOG_BASE_NAME;
            if (newConfig.PROMPT_LOG_MODE !== undefined) currentConfig.PROMPT_LOG_MODE = newConfig.PROMPT_LOG_MODE;
            if (newConfig.REQUEST_MAX_RETRIES !== undefined) currentConfig.REQUEST_MAX_RETRIES = newConfig.REQUEST_MAX_RETRIES;
            if (newConfig.REQUEST_BASE_DELAY !== undefined) currentConfig.REQUEST_BASE_DELAY = newConfig.REQUEST_BASE_DELAY;
            if (newConfig.CRON_NEAR_MINUTES !== undefined) currentConfig.CRON_NEAR_MINUTES = newConfig.CRON_NEAR_MINUTES;
            if (newConfig.CRON_REFRESH_TOKEN !== undefined) currentConfig.CRON_REFRESH_TOKEN = newConfig.CRON_REFRESH_TOKEN;
            if (newConfig.PROVIDER_FILE_PATH !== undefined) currentConfig.PROVIDER_FILE_PATH = newConfig.PROVIDER_FILE_PATH;

            // Handle system prompt update
            if (newConfig.systemPrompt !== undefined) {
                const promptPath = currentConfig.SYSTEM_PROMPT_FILE_PATH || 'input_system_prompt.txt';
                try {
                    const relativePath = path.relative(process.cwd(), promptPath);
                    writeFileSync(promptPath, newConfig.systemPrompt, 'utf-8');
                    
                    // 广播更新事件
                    broadcastEvent('config_update', {
                        action: 'update',
                        filePath: relativePath,
                        type: 'system_prompt',
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log('[UI API] System prompt updated');
                } catch (e) {
                    console.warn('[UI API] Failed to write system prompt:', e.message);
                }
            }

            // Update config.json file - ONLY basic config fields
            try {
                const configPath = 'config.json';
                
                // Create a clean config object for saving (exclude runtime-only properties and key/auth)
                const configToSave = {
                    REQUIRED_API_KEY: currentConfig.REQUIRED_API_KEY,
                    SERVER_PORT: currentConfig.SERVER_PORT,
                    HOST: currentConfig.HOST,
                    SYSTEM_PROMPT_FILE_PATH: currentConfig.SYSTEM_PROMPT_FILE_PATH,
                    SYSTEM_PROMPT_MODE: currentConfig.SYSTEM_PROMPT_MODE,
                    PROMPT_LOG_BASE_NAME: currentConfig.PROMPT_LOG_BASE_NAME,
                    PROMPT_LOG_MODE: currentConfig.PROMPT_LOG_MODE,
                    REQUEST_MAX_RETRIES: currentConfig.REQUEST_MAX_RETRIES,
                    REQUEST_BASE_DELAY: currentConfig.REQUEST_BASE_DELAY,
                    CRON_NEAR_MINUTES: currentConfig.CRON_NEAR_MINUTES,
                    CRON_REFRESH_TOKEN: currentConfig.CRON_REFRESH_TOKEN,
                    PROVIDER_FILE_PATH: currentConfig.PROVIDER_FILE_PATH
                };

                writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
                console.log('[UI API] Configuration saved to config.json (credentials managed in provider.json)');
                
                // 广播更新事件
                broadcastEvent('config_update', {
                    action: 'update',
                    filePath: 'config.json',
                    type: 'main_config',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('[UI API] Failed to save configuration to file:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: 'Failed to save configuration to file: ' + error.message,
                        partial: true  // Indicate that memory config was updated but not saved
                    }
                }));
                return true;
            }

            // Update the global CONFIG object to reflect changes immediately
            Object.assign(CONFIG, currentConfig);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Configuration updated successfully',
                details: 'Basic configuration updated in config.json. All credentials are managed in provider.json'
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Get system information
    if (method === 'GET' && pathParam === '/api/system') {
        const memUsage = process.memoryUsage();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            nodeVersion: process.version,
            serverTime: new Date().toLocaleString(),
            memoryUsage: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
            uptime: process.uptime()
        }));
        return true;
    }

    // Get provider pools summary
    if (method === 'GET' && pathParam === '/api/providers') {
        let providerPools = {};
        try {
            if (providerPoolManager && providerPoolManager.providerPools) {
                providerPools = providerPoolManager.providerPools;
            } else if (currentConfig.PROVIDER_FILE_PATH && existsSync(currentConfig.PROVIDER_FILE_PATH)) {
                const poolsData = JSON.parse(readFileSync(currentConfig.PROVIDER_FILE_PATH, 'utf-8'));
                providerPools = poolsData;
            }
            
            // 转换为统一的数组格式供前端使用
            const normalizedPools = {};
            for (const [providerType, poolData] of Object.entries(providerPools)) {
                normalizedPools[providerType] = getProvidersArray(poolData);
            }
            providerPools = normalizedPools;
        } catch (error) {
            console.warn('[UI API] Failed to load provider pools:', error.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(providerPools));
        return true;
    }

    // Get specific provider type details
    const providerTypeMatch = pathParam.match(/^\/api\/providers\/([^\/]+)$/);
    if (method === 'GET' && providerTypeMatch) {
        const providerType = decodeURIComponent(providerTypeMatch[1]);
        let providerPools = {};
        
        try {
            if (providerPoolManager && providerPoolManager.providerPools) {
                providerPools = providerPoolManager.providerPools;
            } else if (currentConfig.PROVIDER_FILE_PATH && existsSync(currentConfig.PROVIDER_FILE_PATH)) {
                const poolsData = JSON.parse(readFileSync(currentConfig.PROVIDER_FILE_PATH, 'utf-8'));
                providerPools = poolsData;
            }
        } catch (error) {
            console.warn('[UI API] Failed to load provider pools:', error.message);
        }

        const providers = getProvidersArray(providerPools[providerType]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            providerType,
            providers,
            totalCount: providers.length,
            healthyCount: providers.filter(p => p.isHealthy).length
        }));
        return true;
    }

    // Add new provider configuration
    if (method === 'POST' && pathParam === '/api/providers') {
        try {
            const body = await getRequestBody(req);
            const { providerType, providerConfig } = body;

            if (!providerType || !providerConfig) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'providerType and providerConfig are required' } }));
                return true;
            }
            
            const allowedProviderTypes = Object.values(MODEL_PROVIDER);
            if (!allowedProviderTypes.includes(providerType)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: `Unknown providerType '${providerType}'. Allowed types: ${allowedProviderTypes.join(', ')}`
                    }
                }));
                return true;
            }

            // Generate UUID if not provided
            if (!providerConfig.uuid) {
                providerConfig.uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }

            // Set default values
            providerConfig.isHealthy = providerConfig.isHealthy !== undefined ? providerConfig.isHealthy : true;
            providerConfig.lastUsed = providerConfig.lastUsed || null;
            providerConfig.usageCount = providerConfig.usageCount || 0;
            providerConfig.errorCount = providerConfig.errorCount || 0;
            providerConfig.lastErrorTime = providerConfig.lastErrorTime || null;

            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            // Load existing pools
            if (existsSync(filePath)) {
                try {
                    const fileContent = readFileSync(filePath, 'utf8');
                    providerPools = JSON.parse(fileContent);
                } catch (readError) {
                    console.warn('[UI API] Failed to read existing provider pools:', readError.message);
                }
            }

            // Add new provider to the appropriate type
            const providers = getProvidersArray(providerPools[providerType]);
            providers.push(providerConfig);
            setProvidersArray(providerPools, providerType, providers);

            // Save to file
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] Added new provider to ${providerType}: ${providerConfig.uuid}`);

            // Update provider pool manager if available
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }

            // Update CONFIG cache to maintain consistency
            CONFIG.providerPools = providerPools;

            // 广播更新事件
            broadcastEvent('config_update', {
                action: 'add',
                filePath: filePath,
                providerType,
                providerConfig,
                timestamp: new Date().toISOString()
            });

            // 广播提供商更新事件
            broadcastEvent('provider_update', {
                action: 'add',
                providerType,
                providerConfig,
                timestamp: new Date().toISOString()
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Provider added successfully',
                provider: providerConfig,
                providerType
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Update specific provider configuration
    const updateProviderMatch = pathParam.match(/^\/api\/providers\/([^\/]+)\/([^\/]+)$/);
    if (method === 'PUT' && updateProviderMatch) {
        const providerType = decodeURIComponent(updateProviderMatch[1]);
        const providerUuid = updateProviderMatch[2];

        try {
            const body = await getRequestBody(req);
            const { providerConfig } = body;

            if (!providerConfig) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'providerConfig is required' } }));
                return true;
            }

            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            // Load existing pools
            if (existsSync(filePath)) {
                try {
                    const fileContent = readFileSync(filePath, 'utf8');
                    providerPools = JSON.parse(fileContent);
                } catch (readError) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                    return true;
                }
            }

            // Find and update the provider
            const providers = getProvidersArray(providerPools[providerType]);
            const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
            
            if (providerIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }

            // Update provider while preserving certain fields
            const existingProvider = providers[providerIndex];
            const updatedProvider = {
                ...existingProvider,
                ...providerConfig,
                uuid: providerUuid, // Ensure UUID doesn't change
                lastUsed: existingProvider.lastUsed, // Preserve usage stats
                usageCount: existingProvider.usageCount,
                errorCount: existingProvider.errorCount,
                lastErrorTime: existingProvider.lastErrorTime
            };

            providers[providerIndex] = updatedProvider;
            setProvidersArray(providerPools, providerType, providers);

            // Save to file
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] Updated provider ${providerUuid} in ${providerType}`);

            // Update provider pool manager if available
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }

            // Update CONFIG cache to maintain consistency
            CONFIG.providerPools = providerPools;

            // 广播更新事件
            broadcastEvent('config_update', {
                action: 'update',
                filePath: filePath,
                providerType,
                providerConfig: updatedProvider,
                timestamp: new Date().toISOString()
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Provider updated successfully',
                provider: updatedProvider
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Delete specific provider configuration
    if (method === 'DELETE' && updateProviderMatch) {
        const providerType = decodeURIComponent(updateProviderMatch[1]);
        const providerUuid = updateProviderMatch[2];

        try {
            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            // Load existing pools
            if (existsSync(filePath)) {
                try {
                    const fileContent = readFileSync(filePath, 'utf8');
                    providerPools = JSON.parse(fileContent);
                } catch (readError) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                    return true;
                }
            }

            // Find and remove the provider
            const providers = getProvidersArray(providerPools[providerType]);
            const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
            
            if (providerIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }

            const deletedProvider = providers[providerIndex];
            providers.splice(providerIndex, 1);

            // Remove the entire provider type if no providers left
            setProvidersArray(providerPools, providerType, providers);
            if (providers.length === 0) {
                delete providerPools[providerType];
            }

            // Save to file
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] Deleted provider ${providerUuid} from ${providerType}`);

            // Update provider pool manager if available
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }

            // Update CONFIG cache to maintain consistency
            CONFIG.providerPools = providerPools;

            // 广播更新事件
            broadcastEvent('config_update', {
                action: 'delete',
                filePath: filePath,
                providerType,
                providerConfig: deletedProvider,
                timestamp: new Date().toISOString()
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Provider deleted successfully',
                deletedProvider
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Disable/Enable specific provider configuration
    const disableEnableProviderMatch = pathParam.match(/^\/api\/providers\/([^\/]+)\/([^\/]+)\/(disable|enable)$/);
    if (disableEnableProviderMatch) {
        const providerType = decodeURIComponent(disableEnableProviderMatch[1]);
        const providerUuid = disableEnableProviderMatch[2];
        const action = disableEnableProviderMatch[3];

        try {
            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            // Load existing pools
            if (existsSync(filePath)) {
                try {
                    const fileContent = readFileSync(filePath, 'utf8');
                    providerPools = JSON.parse(fileContent);
                } catch (readError) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                    return true;
                }
            }

            // Find and update the provider
            const providers = getProvidersArray(providerPools[providerType]);
            const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
            
            if (providerIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }

            // Update isDisabled field
            const provider = providers[providerIndex];
            provider.isDisabled = action === 'disable';
            
            // Save to file
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] ${action === 'disable' ? 'Disabled' : 'Enabled'} provider ${providerUuid} in ${providerType}`);

            // Update provider pool manager if available
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                
                // Call the appropriate method
                if (action === 'disable') {
                    providerPoolManager.disableProvider(providerType, provider);
                } else {
                    providerPoolManager.enableProvider(providerType, provider);
                }
            }

            // Update CONFIG cache to maintain consistency
            CONFIG.providerPools = providerPools;

            // 广播更新事件
            broadcastEvent('config_update', {
                action: action,
                filePath: filePath,
                providerType,
                providerConfig: provider,
                timestamp: new Date().toISOString()
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: `Provider ${action}d successfully`,
                provider: provider
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Model mapping management for openai-custom providers
    // Get model mappings for a specific provider
    const getModelMappingMatch = pathParam.match(/^\/api\/providers\/([^\/]+)\/([^\/]+)\/model-mapping$/);
    if (method === 'GET' && getModelMappingMatch) {
        const providerType = decodeURIComponent(getModelMappingMatch[1]);
        const providerUuid = getModelMappingMatch[2];
        
        try {
            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            if (existsSync(filePath)) {
                const fileContent = readFileSync(filePath, 'utf8');
                providerPools = JSON.parse(fileContent);
            }
            
            const providers = getProvidersArray(providerPools[providerType]);
            const provider = providers.find(p => p.uuid === providerUuid);
            
            if (!provider) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                modelMapping: provider.modelMapping || {}
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }
    
    // Add or update model mapping
    if (method === 'POST' && getModelMappingMatch) {
        const providerType = decodeURIComponent(getModelMappingMatch[1]);
        const providerUuid = getModelMappingMatch[2];
        
        try {
            const body = await parseRequestBody(req);
            const { clientModel, providerModel } = body;
            
            if (!clientModel || !providerModel) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'clientModel and providerModel are required' } }));
                return true;
            }
            
            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            if (existsSync(filePath)) {
                const fileContent = readFileSync(filePath, 'utf8');
                providerPools = JSON.parse(fileContent);
            }
            
            const providers = getProvidersArray(providerPools[providerType]);
            const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
            
            if (providerIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }
            
            if (!providers[providerIndex].modelMapping) {
                providers[providerIndex].modelMapping = {};
            }
            
            providers[providerIndex].modelMapping[clientModel] = providerModel;
            
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] Added model mapping for ${providerUuid}: ${clientModel} -> ${providerModel}`);
            
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }
            
            CONFIG.providerPools = providerPools;
            
            broadcastEvent('config_update', {
                action: 'update_model_mapping',
                filePath: filePath,
                providerType,
                providerUuid,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Model mapping added successfully',
                modelMapping: providers[providerIndex].modelMapping
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }
    
    // Delete model mapping
    if (method === 'DELETE' && getModelMappingMatch) {
        const providerType = decodeURIComponent(getModelMappingMatch[1]);
        const providerUuid = getModelMappingMatch[2];
        
        try {
            const body = await parseRequestBody(req);
            const { clientModel } = body;
            
            if (!clientModel) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'clientModel is required' } }));
                return true;
            }
            
            const filePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            
            if (existsSync(filePath)) {
                const fileContent = readFileSync(filePath, 'utf8');
                providerPools = JSON.parse(fileContent);
            }
            
            const providers = getProvidersArray(providerPools[providerType]);
            const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
            
            if (providerIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
                return true;
            }
            
            if (!providers[providerIndex].modelMapping || !providers[providerIndex].modelMapping[clientModel]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Model mapping not found' } }));
                return true;
            }
            
            delete providers[providerIndex].modelMapping[clientModel];
            
            writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf8');
            console.log(`[UI API] Deleted model mapping for ${providerUuid}: ${clientModel}`);
            
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }
            
            CONFIG.providerPools = providerPools;
            
            broadcastEvent('config_update', {
                action: 'delete_model_mapping',
                filePath: filePath,
                providerType,
                providerUuid,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Model mapping deleted successfully',
                modelMapping: providers[providerIndex].modelMapping
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Models management API endpoints
    // Get all models from models.json
    if (method === 'GET' && pathParam === '/api/models') {
        try {
            const modelsPath = path.join(process.cwd(), 'models.json');
            if (!existsSync(modelsPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'models.json not found' } }));
                return true;
            }
            
            const modelsData = JSON.parse(readFileSync(modelsPath, 'utf8'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(modelsData));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }
    
    // Add new model to a provider
    if (method === 'POST' && pathParam === '/api/models') {
        try {
            const body = await parseRequestBody(req);
            const { providerKey, model } = body;
            
            if (!providerKey || !model) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'providerKey and model are required' } }));
                return true;
            }
            
            const modelsPath = path.join(process.cwd(), 'models.json');
            let modelsData = JSON.parse(readFileSync(modelsPath, 'utf8'));
            
            if (!modelsData.providers[providerKey]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: `Provider ${providerKey} not found` } }));
                return true;
            }
            
            if (!modelsData.providers[providerKey].models) {
                modelsData.providers[providerKey].models = [];
            }
            
            modelsData.providers[providerKey].models.push(model);
            writeFileSync(modelsPath, JSON.stringify(modelsData, null, 2), 'utf8');
            
            broadcastEvent('config_update', {
                action: 'add_model',
                providerKey,
                model,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Model added successfully',
                model
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }
    
    // Update a model
    const updateModelMatch = pathParam.match(/^\/api\/models\/([^\/]+)\/([^\/]+)$/);
    if (method === 'PUT' && updateModelMatch) {
        const providerKey = decodeURIComponent(updateModelMatch[1]);
        const modelId = decodeURIComponent(updateModelMatch[2]);
        
        try {
            const body = await parseRequestBody(req);
            const { model } = body;
            
            if (!model) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'model is required' } }));
                return true;
            }
            
            const modelsPath = path.join(process.cwd(), 'models.json');
            let modelsData = JSON.parse(readFileSync(modelsPath, 'utf8'));
            
            if (!modelsData.providers[providerKey]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: `Provider ${providerKey} not found` } }));
                return true;
            }
            
            const modelIndex = modelsData.providers[providerKey].models.findIndex(m => m.id === modelId);
            if (modelIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Model not found' } }));
                return true;
            }
            
            modelsData.providers[providerKey].models[modelIndex] = model;
            writeFileSync(modelsPath, JSON.stringify(modelsData, null, 2), 'utf8');
            
            broadcastEvent('config_update', {
                action: 'update_model',
                providerKey,
                model,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Model updated successfully',
                model
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }
    
    // Delete a model
    if (method === 'DELETE' && updateModelMatch) {
        const providerKey = decodeURIComponent(updateModelMatch[1]);
        const modelId = decodeURIComponent(updateModelMatch[2]);
        
        try {
            const modelsPath = path.join(process.cwd(), 'models.json');
            let modelsData = JSON.parse(readFileSync(modelsPath, 'utf8'));
            
            if (!modelsData.providers[providerKey]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: `Provider ${providerKey} not found` } }));
                return true;
            }
            
            const modelIndex = modelsData.providers[providerKey].models.findIndex(m => m.id === modelId);
            if (modelIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Model not found' } }));
                return true;
            }
            
            const deletedModel = modelsData.providers[providerKey].models[modelIndex];
            modelsData.providers[providerKey].models.splice(modelIndex, 1);
            writeFileSync(modelsPath, JSON.stringify(modelsData, null, 2), 'utf8');
            
            broadcastEvent('config_update', {
                action: 'delete_model',
                providerKey,
                modelId,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Model deleted successfully',
                deletedModel
            }));
            return true;
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: error.message } }));
            return true;
        }
    }

    // Server-Sent Events for real-time updates
    if (method === 'GET' && pathParam === '/api/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        res.write('\n');

        // Store the response object for broadcasting
        if (!global.eventClients) {
            global.eventClients = [];
        }
        global.eventClients.push(res);

        // Keep connection alive
        const keepAlive = setInterval(() => {
            res.write(':\n\n');
        }, 30000);

        req.on('close', () => {
            clearInterval(keepAlive);
            global.eventClients = global.eventClients.filter(r => r !== res);
        });

        return true;
    }

    // Get upload configuration files list
    if (method === 'GET' && pathParam === '/api/upload-configs') {
        try {
            const configFiles = await scanConfigFiles(currentConfig, providerPoolManager);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configFiles));
            return true;
        } catch (error) {
            console.error('[UI API] Failed to scan config files:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'Failed to scan config files: ' + error.message
                }
            }));
            return true;
        }
    }

    // View specific configuration file
    const viewConfigMatch = pathParam.match(/^\/api\/upload-configs\/view\/(.+)$/);
    if (method === 'GET' && viewConfigMatch) {
        try {
            const filePath = decodeURIComponent(viewConfigMatch[1]);
            const fullPath = path.join(process.cwd(), filePath);
            
            // 安全检查：确保文件路径在允许的目录内
            const allowedDirs = ['configs'];
            const relativePath = path.relative(process.cwd(), fullPath);
            const isAllowed = allowedDirs.some(dir => relativePath.startsWith(dir + path.sep) || relativePath === dir);
            
            if (!isAllowed) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: '访问被拒绝：只能查看configs目录下的文件'
                    }
                }));
                return true;
            }
            
            if (!existsSync(fullPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: '文件不存在'
                    }
                }));
                return true;
            }
            
            const content = await fs.readFile(fullPath, 'utf8');
            const stats = await fs.stat(fullPath);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                path: relativePath,
                content: content,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                name: path.basename(fullPath)
            }));
            return true;
        } catch (error) {
            console.error('[UI API] Failed to view config file:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'Failed to view config file: ' + error.message
                }
            }));
            return true;
        }
    }

    // Delete specific configuration file
    const deleteConfigMatch = pathParam.match(/^\/api\/upload-configs\/delete\/(.+)$/);
    if (method === 'DELETE' && deleteConfigMatch) {
        try {
            const filePath = decodeURIComponent(deleteConfigMatch[1]);
            const fullPath = path.join(process.cwd(), filePath);
            
            // 安全检查：确保文件路径在允许的目录内
            const allowedDirs = ['configs'];
            const relativePath = path.relative(process.cwd(), fullPath);
            const isAllowed = allowedDirs.some(dir => relativePath.startsWith(dir + path.sep) || relativePath === dir);
            
            if (!isAllowed) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: '访问被拒绝：只能删除configs目录下的文件'
                    }
                }));
                return true;
            }
            
            if (!existsSync(fullPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: '文件不存在'
                    }
                }));
                return true;
            }
            
            // 删除文件前，先清理 provider.json 中引用该文件的提供商记录
            const providerFilePath = currentConfig.PROVIDER_FILE_PATH || 'provider.json';
            let providerPools = {};
            let removedProviders = [];
            
            if (existsSync(providerFilePath)) {
                try {
                    const fileContent = readFileSync(providerFilePath, 'utf8');
                    providerPools = JSON.parse(fileContent);
                    
                    // 遍历所有提供商类型，查找并删除引用该文件的提供商
                    for (const [providerType, poolData] of Object.entries(providerPools)) {
                        const providers = getProvidersArray(poolData);
                        
                        const originalLength = providers.length;
                        const filteredProviders = providers.filter(provider => {
                            // 检查所有可能的凭据字段
                            const credentialFields = [
                                'GEMINI_OAUTH_CREDS_FILE_PATH',
                                'KIRO_OAUTH_CREDS_FILE_PATH',
                                'QWEN_OAUTH_CREDS_FILE_PATH'
                            ];
                            
                            for (const field of credentialFields) {
                                if (provider[field]) {
                                    // 路径比较（考虑不同格式）
                                    if (pathsEqual(relativePath, provider[field]) ||
                                        pathsEqual(relativePath, provider[field].replace(/\\/g, '/'))) {
                                        removedProviders.push({
                                            providerType,
                                            uuid: provider.uuid,
                                            field
                                        });
                                        return false; // 过滤掉该提供商
                                    }
                                }
                            }
                            return true; // 保留该提供商
                        });
                        
                        // 如果该类型下没有提供商了，删除整个类型
                        if (providerPools[providerType].length === 0) {
                            delete providerPools[providerType];
                        }
                    }
                    
                    // 如果有提供商被删除，更新 provider.json
                    if (removedProviders.length > 0) {
                        writeFileSync(providerFilePath, JSON.stringify(providerPools, null, 2), 'utf8');
                        console.log(`[UI API] Removed ${removedProviders.length} provider(s) referencing deleted file: ${relativePath}`);
                        
                        // 更新 provider pool manager
                        if (providerPoolManager) {
                            providerPoolManager.providerPools = providerPools;
                            providerPoolManager.initializeProviderStatus();
                        }
                        
                        // 更新 CONFIG 缓存
                        CONFIG.providerPools = providerPools;
                        
                        // 广播提供商删除事件
                        for (const removed of removedProviders) {
                            broadcastEvent('provider_update', {
                                action: 'delete',
                                providerType: removed.providerType,
                                providerUuid: removed.uuid,
                                reason: 'credential_file_deleted',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                } catch (poolError) {
                    console.warn('[UI API] Failed to clean provider pools:', poolError.message);
                    // 继续删除文件，即使清理提供商池失败
                }
            }
            
            // 删除配置文件
            await fs.unlink(fullPath);
            
            // 广播更新事件
            broadcastEvent('config_update', {
                action: 'delete',
                filePath: relativePath,
                removedProviders: removedProviders.length,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: removedProviders.length > 0
                    ? `文件删除成功，同时移除了 ${removedProviders.length} 个关联的提供商配置`
                    : '文件删除成功',
                filePath: relativePath,
                removedProviders: removedProviders
            }));
            return true;
        } catch (error) {
            console.error('[UI API] Failed to delete config file:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: 'Failed to delete config file: ' + error.message
                }
            }));
            return true;
        }
    }

    // Reload configuration files
    if (method === 'POST' && pathParam === '/api/reload-config') {
        try {
            // Import config manager dynamically
            const { initializeConfig } = await import('./config-manager.js');
            
            // Reload main config
            const newConfig = await initializeConfig(process.argv.slice(2), 'config.json');
            
            // Update global CONFIG
            Object.assign(CONFIG, newConfig);
            
            // 广播更新事件
            broadcastEvent('config_update', {
                action: 'reload',
                filePath: 'config.json',
                providerPoolsPath: newConfig.PROVIDER_FILE_PATH || null,
                timestamp: new Date().toISOString()
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: '配置文件重新加载成功',
                details: {
                    configReloaded: true,
                    configPath: 'config.json',
                    providerPoolsPath: newConfig.PROVIDER_FILE_PATH || null
                }
            }));
            return true;
        } catch (error) {
            console.error('[UI API] Failed to reload config files:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    message: '重新加载配置文件失败: ' + error.message
                }
            }));
            return true;
        }
    }

    return false;
}

/**
 * Initialize UI management features
 * @param {Object} config - The server configuration
 */
export function initializeUIManagement(config) {
    // Initialize log broadcasting for UI
    if (!global.eventClients) {
        global.eventClients = [];
    }
    if (!global.logBuffer) {
        global.logBuffer = [];
    }

    // Override console.log to broadcast logs
    const originalLog = console.log;
    console.log = function(...args) {
        // 立即刷新标准输出，避免缓冲导致卡顿
        originalLog.apply(console, args);
        if (process.stdout.write('')) {
            // Force flush stdout to prevent buffering issues
        }
        
        const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: message
        };
        global.logBuffer.push(logEntry);
        if (global.logBuffer.length > 100) {
            global.logBuffer.shift();
        }
        
        // 使用 setImmediate 异步广播，避免阻塞主线程
        setImmediate(() => {
            broadcastEvent('log', logEntry);
        });
    };

    // Override console.error to broadcast errors
    const originalError = console.error;
    console.error = function(...args) {
        // 立即刷新标准错误输出
        originalError.apply(console, args);
        if (process.stderr.write('')) {
            // Force flush stderr to prevent buffering issues
        }
        
        const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: message
        };
        global.logBuffer.push(logEntry);
        if (global.logBuffer.length > 100) {
            global.logBuffer.shift();
        }
        
        // 使用 setImmediate 异步广播，避免阻塞主线程
        setImmediate(() => {
            broadcastEvent('log', logEntry);
        });
    };
}

/**
 * Helper function to broadcast events to UI clients
 * @param {string} eventType - The type of event
 * @param {any} data - The data to broadcast
 */
export function broadcastEvent(eventType, data) {
    if (global.eventClients && global.eventClients.length > 0) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        global.eventClients.forEach(client => {
            client.write(`event: ${eventType}\n`);
            client.write(`data: ${payload}\n\n`);
        });
    }
}

/**
 * Scan and analyze configuration files
 * @param {Object} currentConfig - The current configuration object
 * @param {Object} providerPoolManager - Provider pool manager instance
 * @returns {Promise<Array>} Array of configuration file objects
 */
async function scanConfigFiles(currentConfig, providerPoolManager) {
    const configFiles = [];
    
    // 只扫描configs目录
    const configsPath = path.join(process.cwd(), 'configs');
    
    if (!existsSync(configsPath)) {
        return configFiles;
    }

    const usedPaths = new Set(); // 存储已使用的路径，用于判断关联状态

    // 使用最新的提供商池数据 - 所有凭据现在都在 provider.json 中
    let providerPools = currentConfig.providerPools;
    if (providerPoolManager && providerPoolManager.providerPools) {
        providerPools = providerPoolManager.providerPools;
    }

    // 检查提供商池文件中的所有OAuth凭据路径 - 标准化路径格式
    if (providerPools) {
        for (const [providerType, poolData] of Object.entries(providerPools)) {
            const providers = getProvidersArray(poolData);
            for (const provider of providers) {
                // 检查各种可能的凭据字段
                const credentialFields = [
                    'GEMINI_OAUTH_CREDS_FILE_PATH',
                    'KIRO_OAUTH_CREDS_FILE_PATH',
                    'QWEN_OAUTH_CREDS_FILE_PATH',
                    'OPENAI_API_KEY',
                    'CLAUDE_API_KEY'
                ];
                
                for (const field of credentialFields) {
                    if (provider[field]) {
                        const normalizedPath = provider[field].replace(/\\/g, '/');
                        usedPaths.add(provider[field]);
                        usedPaths.add(normalizedPath);
                        if (normalizedPath.startsWith('./')) {
                            usedPaths.add(normalizedPath.slice(2));
                        }
                    }
                }
            }
        }
    }

    try {
        // 扫描configs目录下的所有子目录和文件
        const configsFiles = await scanOAuthDirectory(configsPath, usedPaths, currentConfig);
        configFiles.push(...configsFiles);
    } catch (error) {
        console.warn(`[Config Scanner] Failed to scan configs directory:`, error.message);
    }

    return configFiles;
}

/**
 * Analyze OAuth configuration file and return metadata
 * @param {string} filePath - Full path to the file
 * @param {Set} usedPaths - Set of paths currently in use
 * @returns {Promise<Object|null>} OAuth file information object
 */
async function analyzeOAuthFile(filePath, usedPaths, currentConfig) {
    try {
        const stats = await fs.stat(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const filename = path.basename(filePath);
        const relativePath = path.relative(process.cwd(), filePath);
        
        // 读取文件内容进行分析
        let content = '';
        let type = 'oauth_credentials';
        let isValid = true;
        let errorMessage = '';
        let oauthProvider = 'unknown';
        let usageInfo = getFileUsageInfo(relativePath, filename, usedPaths, currentConfig);
        
        try {
            if (ext === '.json') {
                const rawContent = await fs.readFile(filePath, 'utf8');
                const jsonData = JSON.parse(rawContent);
                content = rawContent;
                
                // 识别OAuth提供商
                if (jsonData.apiKey || jsonData.api_key) {
                    type = 'api_key';
                } else if (jsonData.client_id || jsonData.client_secret) {
                    oauthProvider = 'oauth2';
                } else if (jsonData.access_token || jsonData.refresh_token) {
                    oauthProvider = 'token_based';
                } else if (jsonData.credentials) {
                    oauthProvider = 'service_account';
                }
                
                if (jsonData.base_url || jsonData.endpoint) {
                    if (jsonData.base_url.includes('openai.com')) {
                        oauthProvider = 'openai';
                    } else if (jsonData.base_url.includes('anthropic.com')) {
                        oauthProvider = 'claude';
                    } else if (jsonData.base_url.includes('googleapis.com')) {
                        oauthProvider = 'gemini';
                    }
                }
            } else {
                content = await fs.readFile(filePath, 'utf8');
                
                if (ext === '.key' || ext === '.pem') {
                    if (content.includes('-----BEGIN') && content.includes('PRIVATE KEY-----')) {
                        oauthProvider = 'private_key';
                    }
                } else if (ext === '.txt') {
                    if (content.includes('api_key') || content.includes('apikey')) {
                        oauthProvider = 'api_key';
                    }
                } else if (ext === '.oauth' || ext === '.creds') {
                    oauthProvider = 'oauth_credentials';
                }
            }
        } catch (readError) {
            isValid = false;
            errorMessage = `无法读取文件: ${readError.message}`;
        }
        
        return {
            name: filename,
            path: relativePath,
            size: stats.size,
            type: type,
            provider: oauthProvider,
            extension: ext,
            modified: stats.mtime.toISOString(),
            isValid: isValid,
            errorMessage: errorMessage,
            isUsed: isPathUsed(relativePath, filename, usedPaths),
            usageInfo: usageInfo, // 新增详细关联信息
            preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        };
    } catch (error) {
        console.warn(`[OAuth Analyzer] Failed to analyze file ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Get detailed usage information for a file
 * @param {string} relativePath - Relative file path
 * @param {string} fileName - File name
 * @param {Set} usedPaths - Set of used paths
 * @param {Object} currentConfig - Current configuration
 * @returns {Object} Usage information object
 */
function getFileUsageInfo(relativePath, fileName, usedPaths, currentConfig) {
    const usageInfo = {
        isUsed: false,
        usageType: null,
        usageDetails: []
    };

    // 检查是否被使用
    const isUsed = isPathUsed(relativePath, fileName, usedPaths);
    if (!isUsed) {
        return usageInfo;
    }

    usageInfo.isUsed = true;

    // 所有凭据现在都在 provider.json 中管理，不再检查 config.json

    // 检查提供商池中的使用情况
    if (currentConfig.providerPools) {
        // 使用 flatMap 将双重循环优化为单层循环 O(n)
        const allProviders = Object.entries(currentConfig.providerPools).flatMap(
            ([providerType, poolData]) => {
                const providers = getProvidersArray(poolData);
                return providers.map((provider, index) => ({ provider, providerType, index }));
            }
        );

        for (const { provider, providerType, index } of allProviders) {
            const providerUsages = [];

            if (provider.GEMINI_OAUTH_CREDS_FILE_PATH &&
                (pathsEqual(relativePath, provider.GEMINI_OAUTH_CREDS_FILE_PATH) ||
                 pathsEqual(relativePath, provider.GEMINI_OAUTH_CREDS_FILE_PATH.replace(/\\/g, '/')))) {
                providerUsages.push({
                    type: '提供商池',
                    location: `Gemini OAuth凭据 (节点${index + 1})`,
                    providerType: providerType,
                    providerIndex: index,
                    configKey: 'GEMINI_OAUTH_CREDS_FILE_PATH'
                });
            }

            if (provider.KIRO_OAUTH_CREDS_FILE_PATH &&
                (pathsEqual(relativePath, provider.KIRO_OAUTH_CREDS_FILE_PATH) ||
                 pathsEqual(relativePath, provider.KIRO_OAUTH_CREDS_FILE_PATH.replace(/\\/g, '/')))) {
                providerUsages.push({
                    type: '提供商池',
                    location: `Kiro OAuth凭据 (节点${index + 1})`,
                    providerType: providerType,
                    providerIndex: index,
                    configKey: 'KIRO_OAUTH_CREDS_FILE_PATH'
                });
            }

            if (provider.QWEN_OAUTH_CREDS_FILE_PATH &&
                (pathsEqual(relativePath, provider.QWEN_OAUTH_CREDS_FILE_PATH) ||
                 pathsEqual(relativePath, provider.QWEN_OAUTH_CREDS_FILE_PATH.replace(/\\/g, '/')))) {
                providerUsages.push({
                    type: '提供商池',
                    location: `Qwen OAuth凭据 (节点${index + 1})`,
                    providerType: providerType,
                    providerIndex: index,
                    configKey: 'QWEN_OAUTH_CREDS_FILE_PATH'
                });
            }
            
            if (providerUsages.length > 0) {
                usageInfo.usageType = 'provider_pool';
                usageInfo.usageDetails.push(...providerUsages);
            }
        }
    }

    // 如果有多个使用位置，标记为多种用途
    if (usageInfo.usageDetails.length > 1) {
        usageInfo.usageType = 'multiple';
    }

    return usageInfo;
}

/**
 * Scan OAuth directory for credential files
 * @param {string} dirPath - Directory path to scan
 * @param {Set} usedPaths - Set of used paths
 * @param {Object} currentConfig - Current configuration
 * @returns {Promise<Array>} Array of OAuth configuration file objects
 */
async function scanOAuthDirectory(dirPath, usedPaths, currentConfig) {
    const oauthFiles = [];
    
    try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            
            if (file.isFile()) {
                const ext = path.extname(file.name).toLowerCase();
                // 只关注OAuth相关的文件类型
                if (['.json', '.oauth', '.creds', '.key', '.pem', '.txt'].includes(ext)) {
                    const fileInfo = await analyzeOAuthFile(fullPath, usedPaths, currentConfig);
                    if (fileInfo) {
                        oauthFiles.push(fileInfo);
                    }
                }
            } else if (file.isDirectory()) {
                // 递归扫描子目录（限制深度）
                const relativePath = path.relative(process.cwd(), fullPath);
                if (relativePath.split(path.sep).length < 3) { // 最大深度3层
                    const subFiles = await scanOAuthDirectory(fullPath, usedPaths, currentConfig);
                    oauthFiles.push(...subFiles);
                }
            }
        }
    } catch (error) {
        console.warn(`[OAuth Scanner] Failed to scan directory ${dirPath}:`, error.message);
    }
    
    return oauthFiles;
}


/**
 * Normalize a path for cross-platform compatibility
 * @param {string} filePath - The file path to normalize
 * @returns {string} Normalized path using forward slashes
 */
function normalizePath(filePath) {
    if (!filePath) return filePath;
    
    // Use path module to normalize and then convert to forward slashes
    const normalized = path.normalize(filePath);
    return normalized.replace(/\\/g, '/');
}

/**
 * Extract filename from any path format
 * @param {string} filePath - The file path
 * @returns {string} Filename
 */
function getFileName(filePath) {
    return path.basename(filePath);
}

/**
 * Check if two paths refer to the same file (cross-platform compatible)
 * @param {string} path1 - First path
 * @param {string} path2 - Second path
 * @returns {boolean} True if paths refer to same file
 */
function pathsEqual(path1, path2) {
    if (!path1 || !path2) return false;
    
    try {
        // Normalize both paths
        const normalized1 = normalizePath(path1);
        const normalized2 = normalizePath(path2);
        
        // Direct match
        if (normalized1 === normalized2) {
            return true;
        }
        
        // Remove leading './' if present
        const clean1 = normalized1.replace(/^\.\//, '');
        const clean2 = normalized2.replace(/^\.\//, '');
        
        if (clean1 === clean2) {
            return true;
        }
        
        // Check if one is a subset of the other (for relative vs absolute)
        if (normalized1.endsWith('/' + clean2) || normalized2.endsWith('/' + clean1)) {
            return true;
        }
        
        return false;
    } catch (error) {
        console.warn(`[Path Comparison] Error comparing paths: ${path1} vs ${path2}`, error.message);
        return false;
    }
}

/**
 * Check if a file path is being used (cross-platform compatible)
 * @param {string} relativePath - Relative path
 * @param {string} fileName - File name
 * @param {Set} usedPaths - Set of used paths
 * @returns {boolean} True if the file is being used
 */
function isPathUsed(relativePath, fileName, usedPaths) {
    if (!relativePath) return false;
    
    // Normalize the relative path
    const normalizedRelativePath = normalizePath(relativePath);
    const cleanRelativePath = normalizedRelativePath.replace(/^\.\//, '');
    
    // Get the filename from relative path
    const relativeFileName = getFileName(normalizedRelativePath);
    
    // 遍历所有已使用路径进行匹配
    for (const usedPath of usedPaths) {
        if (!usedPath) continue;
        
        // 1. 直接路径匹配
        if (pathsEqual(relativePath, usedPath) || pathsEqual(relativePath, './' + usedPath)) {
            return true;
        }
        
        // 2. 标准化路径匹配
        if (pathsEqual(normalizedRelativePath, usedPath) ||
            pathsEqual(normalizedRelativePath, './' + usedPath)) {
            return true;
        }
        
        // 3. 清理后的路径匹配
        if (pathsEqual(cleanRelativePath, usedPath) ||
            pathsEqual(cleanRelativePath, './' + usedPath)) {
            return true;
        }
        
        // 4. 文件名匹配（确保不是误匹配）
        const usedFileName = getFileName(usedPath);
        if (usedFileName === fileName || usedFileName === relativeFileName) {
            // 确保是同一个目录下的文件
            const usedDir = path.dirname(usedPath);
            const relativeDir = path.dirname(normalizedRelativePath);
            
            if (pathsEqual(usedDir, relativeDir) ||
                pathsEqual(usedDir, cleanRelativePath.replace(/\/[^\/]+$/, '')) ||
                pathsEqual(relativeDir.replace(/^\.\//, ''), usedDir.replace(/^\.\//, ''))) {
                return true;
            }
        }
        
        // 5. 绝对路径匹配（Windows和Unix）
        try {
            const resolvedUsedPath = path.resolve(usedPath);
            const resolvedRelativePath = path.resolve(relativePath);
            
            if (resolvedUsedPath === resolvedRelativePath) {
                return true;
            }
        } catch (error) {
            // Ignore path resolution errors
        }
    }
    
    return false;
}
