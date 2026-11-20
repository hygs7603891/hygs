#!/usr/bin/env python3
"""
WorkBuddy 内部任务 / 脚本调用 FreeLLMAPI 的统一入口（零依赖，只用标准库）。

用法:
    from wb_llm import chat
    print(chat("用一句话介绍四川"))

或直接命令行:
    python wb_llm.py "你好" --model nvidia/nemotron-3-super-120b-a12b:free

环境变量（已 setx 持久化）:
    FREELLMAPI_BASE_URL  http://127.0.0.1:3001/v1
    FREELLMAPI_KEY       freellmapi-xxxxxxxx
"""
import os
import sys
import json
import urllib.request
import urllib.error

BASE_URL = os.environ.get("FREELLMAPI_BASE_URL", "http://127.0.0.1:3001/v1").rstrip("/")
API_KEY = os.environ.get("FREELLMAPI_KEY", "")
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"  # openrouter 免费，实测干净返回；可用 list_models() 查看全部 75 个可路由模型


def chat(prompt: str, model: str = DEFAULT_MODEL, max_tokens: int = 512,
         system: str | None = None, temperature: float = 0.7) -> str:
    """发一条 user 消息，返回助手文本。失败抛异常。"""
    if not API_KEY:
        raise RuntimeError("FREELLMAPI_KEY 未设置（setx FREELLMAPI_KEY=... 后重开终端）")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        BASE_URL + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + API_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def list_models() -> list[str]:
    """返回可用模型 id 列表（带 Key 时返回面板目录）。"""
    req = urllib.request.Request(
        BASE_URL + "/models",
        headers={"Authorization": "Bearer " + API_KEY},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    arr = data.get("data", data if isinstance(data, list) else [])
    return [m.get("id") for m in arr]


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "Say hi in one sentence."
    model = DEFAULT_MODEL
    if "--model" in sys.argv:
        model = sys.argv[sys.argv.index("--model") + 1]
    try:
        out = chat(text, model=model)
        print(out)
    except Exception as e:
        print("ERR:", e, file=sys.stderr)
        sys.exit(1)
