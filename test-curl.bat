@echo off
chcp 65001 >nul
echo ============================================================
echo   Testing Minimal OpenAI Proxy with curl
echo ============================================================
echo.

set API_KEY=admin123
set BASE_URL=http://localhost:3000

echo [Test 1] Health Check
echo Command: curl %BASE_URL%/health
echo.
curl -s "%BASE_URL%/health"
echo.
echo.

echo [Test 2] List Models (GET /v1/models)
echo Command: curl -H "Authorization: Bearer ***" %BASE_URL%/v1/models
echo.
curl -s "%BASE_URL%/v1/models" ^
  -H "Authorization: Bearer %API_KEY%"
echo.
echo.

echo [Test 3] OpenAI Chat Completion (POST /v1/chat/completions)
echo Command: curl -X POST %BASE_URL%/v1/chat/completions
echo Request: {model:"gpt-4", messages:[{role:"user",content:"Say hello"}]}
echo.
curl -s "%BASE_URL%/v1/chat/completions" ^
  -H "Authorization: Bearer %API_KEY%" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in Chinese\"}],\"stream\":false,\"max_tokens\":100}"
echo.
echo.

echo [Test 4] Claude Messages (POST /v1/messages)
echo Command: curl -X POST %BASE_URL%/v1/messages
echo Request: {model:"claude-3-5-sonnet", messages:[{role:"user",content:"Say hello"}]}
echo.
curl -s "%BASE_URL%/v1/messages" ^
  -H "Authorization: Bearer %API_KEY%" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"claude-3-5-sonnet-20241022\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in Chinese\"}],\"max_tokens\":100,\"stream\":false}"
echo.
echo.

echo ============================================================
echo   All tests completed!
echo   Check server console for detailed request logs
echo ============================================================
pause
