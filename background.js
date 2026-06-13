async function injectContentScript(tab) {
    
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
        console.warn("Cannot inject script into system page:", tab.url);
        return false;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        return true;
    } catch (err) {
        console.error("Injection failed: ", err);
        return false;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    
    if (request.action === "fetchProjects") {
        const apiUrl = "https://selinkpro.com/api/v1/projects"; 
        fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: request.api_key })
        })
        .then(response => {
            if (!response.ok) throw new Error("Server error");
            return response.json();
        })
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));

        return true; 
    }
    

    

    if (request.action === "ACTIVATE_CONTENT_SCRIPT") {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const activeTab = tabs[0];
            const success = await injectContentScript(activeTab); 
            
            if (success) {
                chrome.tabs.sendMessage(activeTab.id, { 
                    action: request.subAction,
                    domains: request.domains
                });
            }
        });
        return true;
    }

    if (request.action === "fetchProjectDomains") {
        chrome.storage.local.get(['userApiKey', 'selectedProjectId'], (result) => {
            const userApiKey = result.userApiKey;
            const projectId = result.selectedProjectId ? parseInt(result.selectedProjectId) : 0;
            
            if (!userApiKey) {
                sendResponse({ success: false, error: "API key is missing" });
                return;
            }

            const apiUrl = "https://selinkpro.com/api/v1/project-domains"; 
            fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: userApiKey, project_id: projectId })
            })
            .then(r => r.json())
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        });
        return true;
    }

    if (request.action === "fetchAhrefs") {
        
        chrome.storage.local.get(['userApiKey', 'selectedProjectId'], (result) => {
            const userApiKey = result.userApiKey;
            const projectId = result.selectedProjectId ? parseInt(result.selectedProjectId) : 0;
            
            if (!userApiKey) {
                sendResponse({ success: false, error: "API key is not configured. Please set it in the extension settings." });
                return;
            }

            const domain = request.domain;
            const apiUrl = "https://selinkpro.com/api/v1/check-domain";

            fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    domain: domain,
                    api_key: userApiKey,
                    project_id: projectId  // <--- ПЕРЕДАЕМ ID ПРОЕКТА В ПИТОН
                })
            })
            .then(response => {
                if (response.status === 401) throw new Error("Invalid API key");
                if (response.status === 402) throw new Error("Insufficient funds");
                if (!response.ok) throw new Error(`Server error: ${response.status}`);
                return response.json();
            })
            .then(result => {
                sendResponse(result);
            })
            .catch(err => {
                console.error("[SeLink API] Error:", err);
                sendResponse({ success: false, error: err.message });
            });
        });

        return true; 
    }

    if (request.action === "fetchBalance") {
        
        const apiUrl = "https://selinkpro.com/api/v1/balance"; 

        fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                api_key: request.api_key 
            })
        })
        .then(response => {
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            return response.json();
        })
        .then(result => {
            // Ожидается, что сервер вернет JSON: { "balance": 10.50 }
            sendResponse({ success: true, balance: result.balance });
        })
        .catch(err => {
            console.error("[SeLink API] Balance fetch error:", err);
            sendResponse({ success: false, error: err.message });
        });

        return true; 
    }

});