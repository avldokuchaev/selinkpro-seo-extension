document.addEventListener('DOMContentLoaded', () => {
    const keyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const editKeyBtn = document.getElementById('editKeyBtn');
    const editMode = document.getElementById('editMode');
    const viewMode = document.getElementById('viewMode');
    const savedKeyDisplay = document.getElementById('savedKeyDisplay');
    const runBtn = document.getElementById('runBtn');
    const checkCurrentBtn = document.getElementById('checkCurrentBtn');
    const statusDiv = document.getElementById('status');
    const logoutBtn = document.getElementById('logoutBtn');

    const highlightBtn = document.getElementById('highlightBtn');

    const projectSelectContainer = document.getElementById('projectSelectContainer');
    const projectSelector = document.getElementById('projectSelector');

    let currentApiKey = '';

   
    function maskKey(key) {
        if (key.length <= 8) return '********';
        return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
    }

    function updateBalance(key) {
        const balanceDiv = document.getElementById('balanceDisplay');
        balanceDiv.style.display = 'block';
        balanceDiv.textContent = 'Balance: ...';
        
        chrome.runtime.sendMessage({ action: "fetchBalance", api_key: key }, (response) => {
            if (response && response.success) {
                balanceDiv.textContent = 'Balance: $' + parseFloat(response.balance).toFixed(2);
                balanceDiv.style.background = '#dcfce7';
                balanceDiv.style.color = '#166534';
            } else {
                balanceDiv.textContent = 'Balance: Error';
                balanceDiv.style.background = '#fee2e2';
                balanceDiv.style.color = '#991b1b';
            }
        });
    }


    function loadProjects(key) {
        projectSelectContainer.style.display = 'block';
        projectSelector.innerHTML = '<option value="0">Loading projects...</option>';

        chrome.runtime.sendMessage({ action: "fetchProjects", api_key: key }, (response) => {
            if (response && response.success) {
                projectSelector.innerHTML = '';
                if (response.projects.length === 0) {
                    projectSelector.innerHTML = '<option value="0">No projects found. Create one in dashboard.</option>';
                    chrome.storage.local.set({ selectedProjectId: 0 });
                } else {
                    response.projects.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = `${p.name} (${p.target_url})`;
                        projectSelector.appendChild(opt);
                    });
                    
                    // Восстанавливаем сохраненный выбор или берем первый
                    chrome.storage.local.get(['selectedProjectId'], (res) => {
                        if (res.selectedProjectId && Array.from(projectSelector.options).some(o => o.value === res.selectedProjectId)) {
                            projectSelector.value = res.selectedProjectId;
                        } else {
                            chrome.storage.local.set({ selectedProjectId: projectSelector.value });
                        }
                    });
                }
            } else {
                projectSelector.innerHTML = '<option value="0">Error loading projects</option>';
            }
        });
    }

    // Слушатель изменения селекта
    if (projectSelector) {
        projectSelector.addEventListener('change', (e) => {
            chrome.storage.local.set({ selectedProjectId: e.target.value });
        });
    }

    
    function setViewMode(key) {
        document.getElementById('promoBox').style.display = 'none';
        currentApiKey = key;
        keyInput.value = key;
        savedKeyDisplay.textContent = maskKey(key);
        editMode.style.display = 'none';
        viewMode.style.display = 'flex';
        updateBalance(key);
        loadProjects(key);
    }

   
    function setEditMode() {
        document.getElementById('promoBox').style.display = 'block';
        viewMode.style.display = 'none';
        editMode.style.display = 'flex';
        document.getElementById('balanceDisplay').style.display = 'none';
        projectSelectContainer.style.display = 'none';
        keyInput.focus();
    }

    
    chrome.storage.local.get(['userApiKey'], (result) => {
        if (result.userApiKey) {
            setViewMode(result.userApiKey);
        } else {
            setEditMode();
        }
    });

    
    saveKeyBtn.addEventListener('click', () => {
        const key = keyInput.value.trim();
        if (!key) {
            statusDiv.style.color = '#c0392b';
            statusDiv.innerHTML = 'Enter key!';
            setTimeout(() => statusDiv.innerHTML = '', 1500);
            return;
        }
        chrome.storage.local.set({ userApiKey: key }, () => {
            setViewMode(key);
            statusDiv.style.color = '#27ae60';
            statusDiv.innerHTML = '✔ Saved!';
            setTimeout(() => statusDiv.innerHTML = '', 1500);
        });
    });

    
    editKeyBtn.addEventListener('click', setEditMode);


    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.remove('userApiKey', () => {
            currentApiKey = '';
            keyInput.value = '';
            document.getElementById('balanceDisplay').style.display = 'none'; 
            setEditMode(); 
            
            // Показываем статус выхода
            statusDiv.style.color = '#e67e22';
            statusDiv.innerHTML = 'Logged out / Key deleted';
            setTimeout(() => statusDiv.innerHTML = '', 1500);
        });
    });

   
    function getActiveTabAndSendMessage(actionMsg) {
        if (!currentApiKey) {
            statusDiv.style.color = '#c0392b';
            statusDiv.textContent = 'Save API key first!';
            return;
        }

        
        chrome.runtime.sendMessage({ 
            action: "ACTIVATE_CONTENT_SCRIPT", 
            subAction: actionMsg 
        });

        
        setTimeout(() => window.close(), 100);
    }

    runBtn.addEventListener('click', () => {
        getActiveTabAndSendMessage("START_CHECKER");
    });

    checkCurrentBtn.addEventListener('click', () => {
        getActiveTabAndSendMessage("CHECK_CURRENT_DOMAIN");
    });

    if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
        if (!currentApiKey) {
            statusDiv.style.color = '#c0392b';
            statusDiv.textContent = 'Save API key first!';
            return;
        }
        highlightBtn.textContent = '⏳ Loading...';
        chrome.runtime.sendMessage({ action: "fetchProjectDomains" }, (response) => {
            highlightBtn.textContent = '👀 Highlight project links';
            if (response && response.success) {
                chrome.runtime.sendMessage({ 
                    action: "ACTIVATE_CONTENT_SCRIPT", 
                    subAction: "HIGHLIGHT_PROJECT_DOMAINS",
                    domains: response.domains
                });
                setTimeout(() => window.close(), 100);
            } else {
                statusDiv.style.color = '#c0392b';
                statusDiv.textContent = response?.error || 'Error loading domains';
            }
        });
    });
}

});