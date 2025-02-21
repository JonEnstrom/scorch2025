// cpuNames.js
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCpuNames() {
    try {
        const filePath = path.join(__dirname, 'CPU_Names.dat');
        const data = await readFile(filePath, 'utf8');
        return data.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0); // Remove empty lines
    } catch (error) {
        console.warn('Failed to load CPU_Names.dat, falling back to default names:', error);
        return [
            'CPU_Alpha', 'CPU_Beta', 'CPU_Gamma', 'CPU_Delta', 
            'CPU_Epsilon', 'CPU_Zeta', 'CPU_Eta', 'CPU_Theta',
            'CPU_Iota', 'CPU_Kappa', 'CPU_Lambda', 'CPU_Mu',
            'CPU_Nu', 'CPU_Xi', 'CPU_Omicron', 'CPU_Pi'
        ];
    }
}