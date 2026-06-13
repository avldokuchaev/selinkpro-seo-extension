{
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_CHECKER") {
        console.log('%c [SeLink] Manual check started!', 'background: #222; color: #bada55');
        injectMetrics();
    }
    if (request.action === "CHECK_CURRENT_DOMAIN") {
        console.log('%c [SeLink] Checking current domain!', 'background: #222; color: #bada55');
        checkCurrentSite();
    }

    if (request.action === "HIGHLIGHT_PROJECT_DOMAINS") {
        highlightProjectDomains(request.domains || []);
    }

});

function extractDomain(url) {
    try {
        url = url.replace(/^(https?:\/\/)/i, '').replace(/^(w{2,}\d?\.)/i, '');
        return url.split('/')[0].split('?')[0];
    } catch (e) { return url; }
}

function formatNumber(num) {
    let n = parseFloat(num);
    if (isNaN(n) || n <= 0) return "0";

    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    if (n < 10) return n.toFixed(1);
    
    return Math.floor(n).toString();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isZombieDrop(dr, da, traffic, refDomainsMaj, refSubnets, cf, tf) {
    const subnetRatio = refDomainsMaj > 0 ? refSubnets / refDomainsMaj : 1;
    
    const signals = [];

    
    if (dr >= 20 && traffic < 20)
        signals.push("DR exists, no traffic");

    
    if ((da - dr) > 20 && dr < 25)
        signals.push("DA inflated vs DR (Moz lag)");

    
    if (subnetRatio < 0.3 && refDomainsMaj > 100)
        signals.push(`Subnet ratio suspect: ${subnetRatio.toFixed(2)}`);

    
    if (tf > 0 && (cf / tf) > 2.5)
        signals.push(`Spam CF/TF ratio: ${(cf / tf).toFixed(1)}`);

    return signals.length >= 2 ? signals : null;
}




function updateVerdict(wrapper) {
    const dr         = parseFloat(wrapper.getAttribute('data-dr')          || 0);
    const da         = parseFloat(wrapper.getAttribute('data-da')          || 0);
    const traffic    = parseFloat(wrapper.getAttribute('data-traffic')     || 0);
    const trafVal    = parseFloat(wrapper.getAttribute('data-traf-val')    || 0);
    const tf         = parseFloat(wrapper.getAttribute('data-tf')          || 0);
    const cf         = parseFloat(wrapper.getAttribute('data-cf')          || 0);
    const spam       = parseFloat(wrapper.getAttribute('data-spam')        || 0);
    const rd         = parseFloat(wrapper.getAttribute('data-rd')          || 0);
    const refSubnets = parseFloat(wrapper.getAttribute('data-ref-subnets') || 0); 
    const refDomainsMaj = parseFloat(wrapper.getAttribute('data-ref-domains-maj') || 0);
    const linksOut   = parseFloat(wrapper.getAttribute('data-out')         || 0);
    const edu        = parseFloat(wrapper.getAttribute('data-edu')         || 0);
    const gov        = parseFloat(wrapper.getAttribute('data-gov')         || 0);
    const protocol   = wrapper.getAttribute('data-protocol') || "?";

    const vBox = wrapper.querySelector('.box-verdict');
    vBox.innerHTML = '';

    const vetoes = [];
    const warnings = [];
    const bonuses = [];

    if (protocol === "http") vetoes.push("HTTP (unsafe)");
    if (dr < 5 && traffic < 100) vetoes.push("DR < 5 & no traffic");
    if (dr > 30 && traffic < 50) vetoes.push("DR inflated (no traffic)");
    if (spam >= 30) vetoes.push(`Moz Spam Score: ${spam}%`);

    const isHighTraffic = traffic >= 500;
    const zombieSignals = isZombieDrop(dr, da, traffic, refDomainsMaj, refSubnets, cf, tf);

    if (zombieSignals) {
        if (isHighTraffic) {
            warnings.push(`⚠️ Suspicious profile ignored (Traffic saves it)`);
        } else {
            vetoes.push(`Zombie Drop (${zombieSignals.length} signals):\n` + zombieSignals.map(s => `  · ${s}`).join('\n'));
        }
    } else {
        if (tf > 0 && (cf / tf) > 2.5) {
            if (isHighTraffic) warnings.push(`⚠️ Spam profile (CF/TF = ${(cf / tf).toFixed(1)})`);
            else vetoes.push(`Spam profile (CF/TF = ${(cf / tf).toFixed(1)})`);
        } else if (tf === 0 && cf > 15) {
            if (isHighTraffic) warnings.push("⚠️ TF = 0, CF inflated");
            else vetoes.push("TF = 0, CF inflated");
        }
    }

    if (edu + gov > 0) bonuses.push(`🎓 Edu/Gov links`);
    if (spam < 3)      bonuses.push(`✔ Clean Moz Spam`);
    if (tf >= 20)      bonuses.push(`✔ High TF`);
    if (dr >= 50)      bonuses.push(`💪 Strong DR: ${dr}`);
    if (traffic >= 1000) bonuses.push(`🔥 Traffic > 1k`);
    if (trafVal >= 100)   bonuses.push(`💰 TrafVal: $${trafVal}`);

    if (linksOut > 500)   warnings.push(`⚠️ High Outbound (${linksOut})`);
    if (spam > 15 && spam < 30) warnings.push(`⚠️ Spam Score: ${spam}%`);

    if (vetoes.length > 0) {
        addBadge(vBox, "❌ NO GO", "#c0392b");
        const reasonsCont = document.createElement('div');
        reasonsCont.style.cssText = "margin-top: 4px; border-left: 2px solid #c0392b; padding-left: 5px;";
        
        vetoes.forEach(reason => {
            reason.split('\n').forEach(line => {
                const d = document.createElement('div');
                d.style.cssText = "font-size: 10px; color: #e74c3c; margin-top: 2px; font-weight: bold;";
                d.innerText = `${line.startsWith('  ·') ? line : '• ' + line}`;
                reasonsCont.appendChild(d);
            });
        });
        vBox.appendChild(reasonsCont);
        return;
    }

    let verdict, color, reason = "";
    let hasSpamWarning = warnings.some(w => w.includes('Spam profile') || w.includes('TF = 0') || w.includes('Suspicious profile'));

    if (dr >= 40 && traffic >= 500 && spam < 3 && tf >= 20 && !hasSpamWarning) {
        verdict = "✅ DEFINITELY BUY";
        color   = "#27ae60";
    } else if (dr >= 20 && traffic >= 100 && spam < 15) {
        verdict = "🆗 GOOD TO GO";
        color   = "#2980b9";
        if (hasSpamWarning) reason = "Good traffic but check link profile manually";
    } else if (dr >= 10 && traffic >= 20) {
        verdict = "⚠️ WEAK (buy with caution)";
        color   = "#d35400";
        reason  = "Low DR or low traffic";
    } else {
        verdict = "🚫 NO GO";
        color   = "#7f8c8d";
        reason  = "Donor is too weak";
    }

    addBadge(vBox, verdict, color);

    if (reason) {
        const r = document.createElement('div');
        r.style.cssText = "font-size: 9px; color: #7f8c8d; margin-top: 2px; font-style: italic;";
        r.innerText = reason;
        vBox.appendChild(r);
    }

    if (warnings.length > 0) {
        const wr = document.createElement('div');
        wr.style.cssText = "font-size: 9px; color: #d35400; margin-top: 4px; font-weight: bold; background: #fff3e0; padding: 2px 4px; border-radius: 3px;";
        wr.innerText = warnings.join(' · ');
        vBox.appendChild(wr);
    }

    if (bonuses.length > 0) {
        const b = document.createElement('div');
        b.style.cssText = "font-size: 9px; color: #27ae60; margin-top: 3px; font-weight: bold;";
        b.innerText = bonuses.join(' · ');
        vBox.appendChild(b);
    }
}

async function injectMetrics() {
    let targets = [];

    let seenDomains = new Set();

    const hostParts = window.location.hostname.split('.');
    const baseHost = hostParts.length > 1 ? hostParts.slice(-2).join('.').toLowerCase() : window.location.hostname.toLowerCase();

    let sldIndex = hostParts.length - 2;
    if (sldIndex > 0 && ['co', 'com', 'net', 'org', 'gov', 'edu', 'ru'].includes(hostParts[sldIndex])) {
      sldIndex--; 
    }
    const brandName = hostParts.length > 0 ? hostParts[sldIndex].toLowerCase() : '';

    const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,10})(?:\/[^\s]*)?/i;
    const elements = document.querySelectorAll('a, span, td, b, strong');

    elements.forEach(el => {
        if (el.hasAttribute('data-da-checked')) return;
        if (el.closest('.ggl-metrics-wrapper')) return;

        if (el.closest('head, script, style, noscript, header, footer, nav')) return;

        if (el.offsetWidth === 0 && el.offsetHeight === 0) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        if (el.tagName.toLowerCase() === 'a' && el.hasAttribute('href')) {
            const hrefVal = el.getAttribute('href').trim().toLowerCase();
            if (hrefVal.startsWith('javascript:') || hrefVal.startsWith('mailto:') || hrefVal.startsWith('tel:')) {
                return;
            }
        }

        

        let textToAnalyze = '';
        if (el.tagName.toLowerCase() === 'a' && el.href) {
            
            textToAnalyze = el.href;
        } else {
            
            textToAnalyze = el.innerText ? el.innerText.trim() : '';
        }

        if (textToAnalyze.length < 4) return;

        const match = textToAnalyze.match(domainRegex);
        
        if (match && match[1]) {
            const cleanDomain = match[1].toLowerCase();
            
            if (!cleanDomain.includes('.') || cleanDomain.endsWith('.')) return;

            if (cleanDomain === baseHost || cleanDomain.endsWith('.' + baseHost) || cleanDomain.includes(brandName + '.')) {
                return;
            }

            let isParentWrapper = false;
            const childCandidates = el.querySelectorAll('a, span, b, strong');
            for (let child of childCandidates) {
                let childText = child.innerText ? child.innerText.trim() : (child.href || '');
                if (childText.includes(cleanDomain)) {
                    isParentWrapper = true;
                    break;
                }
            }
            if (isParentWrapper) return;

            
            if (seenDomains.has(cleanDomain)) {
                return;
            }
            seenDomains.add(cleanDomain);

            targets.push({
                element: el,
                domain: cleanDomain,
                insertAfter: el
            });
        }
    });

    if (targets.length === 0) {
        console.log('%c [GGL] No domains found.', 'color: #e67e22');
        return;
    }

    targets.forEach(t => {
        t.element.setAttribute('data-da-checked', 'loading');
        
        const wrapper = document.createElement('div');
        wrapper.className = 'ggl-metrics-wrapper';
        wrapper.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 4px; margin-bottom: 8px; line-height: 1.2; border: 1px solid #eee; padding: 5px; border-radius: 5px; background: #fafafa; width: max-content; max-width: 100%;";
       
        wrapper.innerHTML = `
            <div class="box-domain" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; color: #2980b9; padding-bottom: 3px; border-bottom: 1px solid #e0e0e0; letter-spacing: 0.5px; margin-bottom: 2px;">
                <span>🌍 ${t.domain.toUpperCase()}</span>
                <span class="slp-close-btn" style="cursor: pointer; color: #999; font-size: 14px; line-height: 1; padding: 0 4px;" title="Close">×</span>
            </div>
            <div style="display:flex; flex-direction: column; gap:4px; width:100%;">
                <div class="box-ahrefs" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
                <div class="box-moz" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
                <div class="box-majestic" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
            </div>
            <div class="box-tech" style="display:flex; flex-wrap:wrap; gap:5px; width:100%; padding-top:4px; margin-top:2px; border-top: 1px dashed #ccc;"></div>
            <div class="box-verdict" style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #999; width: 100%;"></div>
        `;

        
        wrapper.querySelector('.slp-close-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            wrapper.remove();
            t.element.removeAttribute('data-da-checked'); 
        });

        t.wrapper = wrapper;

        const columnContainer = document.createElement('div');
        columnContainer.style.cssText = "display: inline-flex; flex-direction: column; align-items: flex-start; width: max-content; max-width: 100%;";

        t.insertAfter.parentNode.insertBefore(columnContainer, t.insertAfter);
        columnContainer.appendChild(t.insertAfter);
        columnContainer.appendChild(wrapper);
    });

    function sendMessageAsync(msg) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(msg, resolve);
        });
    }

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        
        const response = await sendMessageAsync({ action: "fetchAhrefs", domain: t.domain });
            if (response && response.success && response.data) {
                const d = response.data;
                const w = t.wrapper;

                const dr = d.ahrefsDR || 0;
                const rd = d.ahrefsRefDomains || 0;
                const traffic = d.ahrefsTraffic ? parseFloat(d.ahrefsTraffic) : 0;
                const da = d.mozDA || 0; 
                const spam = d.mozSpam || 0; 
                const tf = d.majesticTF || 0;
                const cf = d.majesticCF || 0;
                const keywords = d.ahrefsOrganicKeywords || 0;
                const ahrefsBacklinks = d.ahrefsBacklinks || 0;
                const trafVal = d.ahrefsTrafficValue || 0;
                const edu = d.majesticRefEdu || 0;
                const gov = d.majesticRefGov || 0;
                const linksOut = d.prettyLinksOut || 0;
                const ttfName = d.majesticTTF0Name ? d.majesticTTF0Name.split('/')[0] : "N/A";
                const refDomainsMaj = d.majesticRefDomains || 0;
                const refSubnets = d.majesticRefSubnets || 0;
                
                const ip = d.serverIP || "0.0.0.0";
                const status = d.httpStatus || "???";

                w.setAttribute('data-dr', dr);
                w.setAttribute('data-rd', rd);
                w.setAttribute('data-traffic', traffic);
                w.setAttribute('data-da', da);
                w.setAttribute('data-spam', spam);
                w.setAttribute('data-tf', tf);
                w.setAttribute('data-cf', cf);

                w.setAttribute('data-keywords', keywords);
                w.setAttribute('data-backlinks', ahrefsBacklinks);
                w.setAttribute('data-traf-val', trafVal);
                w.setAttribute('data-edu', edu);
                w.setAttribute('data-gov', gov);
                w.setAttribute('data-out', linksOut);
                w.setAttribute('data-ref-domains-maj', refDomainsMaj);
                w.setAttribute('data-ref-subnets', refSubnets);
                w.setAttribute('data-protocol', d.siteProtocol || "?");

                const ahrefsBox = w.querySelector('.box-ahrefs');
                const mozBox = w.querySelector('.box-moz');
                const majesticBox = w.querySelector('.box-majestic');
                const techBox = w.querySelector('.box-tech');

                if (ahrefsBox) {
                    ahrefsBox.innerHTML = ''; 
                    addBadge(ahrefsBox, `DR: ${dr}`, "#d35400");
                    addBadge(ahrefsBox, `RD: ${formatNumber(rd)}`, "#2c3e50");
                    addBadge(ahrefsBox, `Traf: ${formatNumber(traffic)}`, "#8e44ad"); 
                    addBadge(ahrefsBox, `Keys: ${formatNumber(keywords)}`, "#34495e");
                    if (trafVal > 0) addBadge(ahrefsBox, `$ ${formatNumber(trafVal)}`, "#27ae60");
                }

                if (mozBox) {
                    mozBox.innerHTML = ''; 
                    addBadge(mozBox, `DA: ${da}`, "#0584AC");
                    addBadge(mozBox, `Sp: ${spam}%`, spam > 20 ? "#c0392b" : "#27ae60");
                }
                
                if (majesticBox) {
                    majesticBox.innerHTML = '';
                    addBadge(majesticBox, `TF: ${tf}`, "#16a085");
                    addBadge(majesticBox, `CF: ${cf}`, "#2980b9");
                    addBadge(majesticBox, `Theme: ${ttfName}`, "#8e44ad");
                    if (edu > 0 || gov > 0) {
                        addBadge(majesticBox, `🎓 Edu/Gov: ${formatNumber(edu + gov)}`, "#d35400");
                    }
                }

                if (techBox) {
                    techBox.innerHTML = '';
                    const sColor = status === 200 ? "#27ae60" : "#c0392b";
                    addBadge(techBox, `Status: ${status}`, sColor);
                    addBadge(techBox, `IP: ${ip}`, "#34495e");

                    const proto = d.siteProtocol || "?";
                    const protoColor = proto === "https" ? "#27ae60" : proto === "http" ? "#e74c3c" : "#7f8c8d";
                    addBadge(techBox, `🔒 ${proto.toUpperCase()}`, protoColor);

                    const dups = d.pbnDuplicates || [];
                    if (dups.length > 0) {
                        const dupsText = dups.length > 2 ? `${dups.slice(0,2).join(', ')} and +${dups.length - 2} more` : dups.join(', ');
                        addBadge(techBox, `⚠️ PBN (${dups.length}): ${dupsText}`, "#e67e22");
                    }
                }

                updateVerdict(w);
            } else {
            
            const w = t.wrapper;
            const errorMsg = response && response.error ? response.error : 'Server connection error';
            
            w.innerHTML = `
                <div class="box-domain" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; color: #2980b9; padding-bottom: 3px; border-bottom: 1px solid #e0e0e0; letter-spacing: 0.5px; margin-bottom: 2px;">
                    <span>🌍 ${t.domain.toUpperCase()}</span>
                    <span class="slp-close-btn" style="cursor: pointer; color: #999; font-size: 14px; line-height: 1; padding: 0 4px;" title="Close">×</span>
                </div>
                <div style="color: #c0392b; font-size: 11px; font-weight: bold; padding: 4px 0;">❌ ${errorMsg}</div>
            `;
            
            
            w.querySelector('.slp-close-btn').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                w.remove();
                t.element.removeAttribute('data-da-checked');
            });
            }
        
        await sleep(500); 
    }
}

function addBadge(parent, text, color) {
    const b = document.createElement('span');
    b.innerText = text;
    b.style.cssText = `background: ${color}; color: white; border-radius: 3px; padding: 2px 5px; font-size: 10px; margin-right: 3px; font-weight: bold; display: inline-block; white-space: nowrap;`;
    parent.appendChild(b);
    return b;
}

function highlightProjectDomains(projectDomains) {
    if (!projectDomains || projectDomains.length === 0) {
        alert('No domens in this project');
        return;
    }

    const domainSet = new Set(projectDomains.map(d => d.toLowerCase()));
    const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,10})(?:\/[^\s]*)?/i;
    const elements = document.querySelectorAll('a');

    let count = 0;
    elements.forEach(el => {
        if (el.hasAttribute('data-slp-highlighted')) return;
        
        if (el.offsetWidth === 0 && el.offsetHeight === 0) return;
        if (el.closest('head, script, style, noscript, header, footer, nav')) return;

        const hrefVal = el.href;
        if (!hrefVal) return;

        const match = hrefVal.match(domainRegex);
        if (match && match[1]) {
            const cleanDomain = match[1].toLowerCase();
            
            if (domainSet.has(cleanDomain)) {
                const existingBadge = document.querySelector(`.slp-project-badge[data-slp-domain="${cleanDomain}"]`);
                
                if (!existingBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'slp-project-badge';
                    badge.setAttribute('data-slp-domain', cleanDomain);
                    badge.innerHTML = '✔ In project';
                    badge.style.cssText = "display: inline-block; color: #27ae60; font-size: 11px; font-weight: 600; margin-left: 6px; background: #eaffea; padding: 2px 6px; border-radius: 4px; border: 1px solid #27ae60; vertical-align: middle; line-height: 1.2; z-index: 2147483647;";
                    
                    el.insertAdjacentElement('afterend', badge);
                    count++;
                }
                el.setAttribute('data-slp-highlighted', 'true');
            }
        }
    });

    const toast = document.createElement('div');
    toast.innerText = `Found ${count} unique links from the project`;
    toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #27ae60; color: white; padding: 10px 20px; border-radius: 8px; font-family: sans-serif; font-size: 14px; z-index: 2147483647; box-shadow: 0 4px 6px rgba(0,0,0,0.1);";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function checkCurrentSite() {
    if (document.getElementById('selink-sidebar')) return;
    let currentDomain = window.location.hostname.replace(/^(www\.)/i, '');

    let sidebar = document.getElementById('selink-sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'selink-sidebar';
        sidebar.style.cssText = "position: fixed; top: 20px; right: 20px; width: 320px; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 2147483647; border-radius: 6px; padding: 12px; font-family: sans-serif;";
        
        const header = document.createElement('div');
        header.style.cssText = "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 10px;";
        header.innerHTML = `<span style="font-weight: bold; color: #2980b9; font-size: 14px;">Current Site Analysis</span><span id="selink-close" style="cursor: pointer; color: #999; font-weight: bold; font-size: 16px;">✖</span>`;
        sidebar.appendChild(header);
        
        document.body.appendChild(sidebar);
        document.getElementById('selink-close').onclick = () => sidebar.remove();
    }

    let content = document.getElementById('selink-sidebar-content');
    if (content) content.remove();
    
    content = document.createElement('div');
    content.id = 'selink-sidebar-content';
    sidebar.appendChild(content);

    const wrapper = document.createElement('div');
    wrapper.className = 'ggl-metrics-wrapper';
    wrapper.style.cssText = "display: flex; flex-direction: column; gap: 4px; line-height: 1.2; background: #fafafa; padding: 8px; border-radius: 4px; border: 1px solid #eee;";
    
    wrapper.innerHTML = `
        <div class="box-domain" style="font-size: 13px; font-weight: bold; color: #2980b9; padding-bottom: 5px; border-bottom: 1px solid #e0e0e0; margin-bottom: 4px;">
            🌍 ${currentDomain.toUpperCase()} <span id="slp-loading" style="font-size:10px; color:#e67e22; float:right;">Loading...</span>
        </div>
        <div style="display:flex; flex-direction: column; gap:4px; width:100%;">
            <div class="box-ahrefs" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
            <div class="box-moz" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
            <div class="box-majestic" style="display:flex; flex-wrap:wrap; gap:3px;"></div>
        </div>
        <div class="box-tech" style="display:flex; flex-wrap:wrap; gap:5px; width:100%; padding-top:4px; margin-top:2px; border-top: 1px dashed #ccc;"></div>
        <div class="box-verdict" style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #999; width: 100%;"></div>
    `;
    content.appendChild(wrapper);

    function sendMessageAsync(msg) {
        return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
    }

    const response = await sendMessageAsync({ action: "fetchAhrefs", domain: currentDomain });
    const loader = document.getElementById('slp-loading');
    if (loader) loader.remove();

    if (response && response.success && response.data) {
        const d = response.data;
        const w = wrapper;

        const dr = d.ahrefsDR || 0;
        const rd = d.ahrefsRefDomains || 0;
        const traffic = d.ahrefsTraffic ? parseFloat(d.ahrefsTraffic) : 0;
        const da = d.mozDA || 0; 
        const spam = d.mozSpam || 0; 
        const tf = d.majesticTF || 0;
        const cf = d.majesticCF || 0;
        const keywords = d.ahrefsOrganicKeywords || 0;
        const ahrefsBacklinks = d.ahrefsBacklinks || 0;
        const trafVal = d.ahrefsTrafficValue || 0;
        const edu = d.majesticRefEdu || 0;
        const gov = d.majesticRefGov || 0;
        const linksOut = d.prettyLinksOut || 0;
        const ttfName = d.majesticTTF0Name ? d.majesticTTF0Name.split('/')[0] : "N/A";
        const refDomainsMaj = d.majesticRefDomains || 0;
        const refSubnets = d.majesticRefSubnets || 0;
        
        const ip = d.serverIP || "0.0.0.0";
        const status = d.httpStatus || "???";

        w.setAttribute('data-dr', dr);
        w.setAttribute('data-rd', rd);
        w.setAttribute('data-traffic', traffic);
        w.setAttribute('data-da', da);
        w.setAttribute('data-spam', spam);
        w.setAttribute('data-tf', tf);
        w.setAttribute('data-cf', cf);
        w.setAttribute('data-keywords', keywords);
        w.setAttribute('data-backlinks', ahrefsBacklinks);
        w.setAttribute('data-traf-val', trafVal);
        w.setAttribute('data-edu', edu);
        w.setAttribute('data-gov', gov);
        w.setAttribute('data-out', linksOut);
        w.setAttribute('data-ref-domains-maj', refDomainsMaj);
        w.setAttribute('data-ref-subnets', refSubnets);
        w.setAttribute('data-protocol', d.siteProtocol || "?");

        const ahrefsBox = w.querySelector('.box-ahrefs');
        const mozBox = w.querySelector('.box-moz');
        const majesticBox = w.querySelector('.box-majestic');
        const techBox = w.querySelector('.box-tech');

        if (ahrefsBox) {
            addBadge(ahrefsBox, `DR: ${dr}`, "#d35400");
            addBadge(ahrefsBox, `RD: ${formatNumber(rd)}`, "#2c3e50");
            addBadge(ahrefsBox, `Traf: ${formatNumber(traffic)}`, "#8e44ad"); 
            addBadge(ahrefsBox, `Keys: ${formatNumber(keywords)}`, "#34495e");
            if (trafVal > 0) addBadge(ahrefsBox, `$ ${formatNumber(trafVal)}`, "#27ae60");
        }

        if (mozBox) {
            addBadge(mozBox, `DA: ${da}`, "#0584AC");
            addBadge(mozBox, `Sp: ${spam}%`, spam > 20 ? "#c0392b" : "#27ae60");
        }
        
        if (majesticBox) {
            addBadge(majesticBox, `TF: ${tf}`, "#16a085");
            addBadge(majesticBox, `CF: ${cf}`, "#2980b9");
            addBadge(majesticBox, `Theme: ${ttfName}`, "#8e44ad");
            if (edu > 0 || gov > 0) {
                addBadge(majesticBox, `🎓 Edu/Gov: ${formatNumber(edu + gov)}`, "#d35400");
            }
        }

        if (techBox) {
            const sColor = status === 200 ? "#27ae60" : "#c0392b";
            addBadge(techBox, `Status: ${status}`, sColor);
            addBadge(techBox, `IP: ${ip}`, "#34495e");

            const proto = d.siteProtocol || "?";
            const protoColor = proto === "https" ? "#27ae60" : proto === "http" ? "#e74c3c" : "#7f8c8d";
            addBadge(techBox, `🔒 ${proto.toUpperCase()}`, protoColor);

            const dups = d.pbnDuplicates || [];
            if (dups.length > 0) {
                const dupsText = dups.length > 2 ? `${dups.slice(0,2).join(', ')} and +${dups.length - 2} more` : dups.join(', ');
                addBadge(techBox, `⚠️ PBN (${dups.length}): ${dupsText}`, "#e67e22");
            }
        }

        updateVerdict(w);
    } else {
        const errorMsg = response && response.error ? response.error : 'Server connection error';
        wrapper.innerHTML += `<div style="color: #c0392b; font-size: 11px; font-weight: bold; padding: 4px 0;">❌ ${errorMsg}</div>`;
    }
}
}