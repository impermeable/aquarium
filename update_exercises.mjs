/**
 * Utility script to update the exercise dropdown
 */

import fs from 'fs';
import path from 'path';

const REPOS = [
    {
        owner: 'impermeable',
        repo: 'waterproof-exercise-sheets',
        branch: 'main',
        title: 'Waterproof Exercise Sheets'
    },
    {
        owner: 'impermeable',
        repo: 'introduction-to-proof-sheets',
        branch: 'main',
        title: 'Introduction To Proof Sheets'
    }
];

async function fetchRepoFiles(repoInfo) {
    const { owner, repo, branch } = repoInfo;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    if (!response.ok) {
        throw new Error(`Failed to fetch info from github api for '${owner}/${repo}': ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.tree.filter((node) => node.type === 'blob' && node.path.endsWith('.mv'));
}

async function updateDropdown() {
    try {
        console.log('Fetching exercise files from GitHub...');
        
        const indentationLevel = 5; // in tabs
        const indentation = '\t'.repeat(indentationLevel);

        const options = [indentation + '<option value="">-- Select Sheet --</option>'];
        let totalFiles = 0;

        for (const repoInfo of REPOS) {
            const files = await fetchRepoFiles(repoInfo);
            totalFiles += files.length;
            
            // Sort files logically by chapter / lecture, then by sheet
            files.sort((a, b) => {
                const getNum = (path, regex) => {
                    const match = path.match(regex);
                    return match ? parseInt(match[1], 10) : 0;
                };

                const aCh = getNum(a.path, /(?:ch|lecture)(\d+)/i);
                const bCh = getNum(b.path, /(?:ch|lecture)(\d+)/i);

                if (aCh !== bCh) return aCh - bCh;

                const aSh = getNum(a.path, /sheet(\d+)/i);
                const bSh = getNum(b.path, /sheet(\d+)/i);
                
                if (aSh !== bSh) return aSh - bSh;
                
                return a.path.localeCompare(b.path);
            });

            // Add separator line
            if (REPOS.length > 0) {
                options.push(`${indentation}<option disabled>──────────</option>`);
            }
            
            files.forEach(file => {
                let basename = path.basename(file.path);
                let prettyName = basename;
                
                if (basename === 'waterproof_tutorial.mv') {
                    prettyName = 'Waterproof Tutorial';
                } else {
                    prettyName = prettyName
                        .replace('.mv', '')
                        .replace(/^ch(\d+)_/i, 'Chapter $1: ')
                        .replace(/^sheet(\d+)_/i, 'Sheet $1: ')
                        .replace(/_/g, ' ');
                        
                    prettyName = prettyName.replace(/\b\w/g, c => c.toUpperCase());
                }

                if (repoInfo.repo === 'introduction-to-proof-sheets') {
                    const match = file.path.match(/^lecture(\d+)\//i);
                    if (match) {
                        prettyName = `Lecture ${match[1]} - ${prettyName}`;
                    }
                }
                
                const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`;
                options.push(`${indentation}<option value="${rawUrl}">${repoInfo.title} - ${prettyName}</option>`);
            });
        }

        // Locate index.html
        const htmlPath = path.join(process.cwd(), 'out', 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const selectRegex = /(<select id="exercise-dropdown">)[\s\S]*?(<\/select>)/m;
        
        if (!selectRegex.test(htmlContent)) {
            throw new Error('Could not find <select id="exercise-dropdown"> in index.html');
        }

        const newHtmlContent = htmlContent.replace(
            selectRegex, 
            `$1\n${options.join('\n')}\n${'\t'.repeat(indentationLevel - 1)}$2`
        );

        fs.writeFileSync(htmlPath, newHtmlContent, 'utf-8');
        console.log(`Successfully updated dropdown list in out/index.html with ${totalFiles} files from ${REPOS.length} repositories:`);
        REPOS.forEach(repo => console.log(`- ${repo.title} (${repo.repo})`));
    } catch (error) {
        console.error("An error occurred while updating the dropdown:", error);
        process.exit(1);
    }
}

updateDropdown();
