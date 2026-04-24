//import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'

let pathsContainerEl: HTMLElement;
let addPathBtnEl: HTMLElement;
let toastEl: HTMLElement;
const selectedPaths = new Set<string>()

function showToast(message: string) {
  toastEl.textContent = message
  toastEl.classList.add('toast-visible')

  /*
  Added by Marco Mattiuz

    const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = message.replace('\n', '<br><span class="toast-detail">')
    + (message.includes('\n') ? '</span>' : '');
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);

  */

  setTimeout(() => {
    toastEl.classList.remove('toast-visible')
    //Added by MM setTimeout(() => toast.remove(), 300);
  }, 3000)
}

function removePath(pathDisplayEl: HTMLElement, path: string) {
  selectedPaths.delete(path)
  pathDisplayEl.remove();
  console.log('Path removed')
}

async function selectPath() {
  try {
    console.log('Opening folder selection dialog...')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Seleziona una cartella musicale'
    }) as string | null;

    console.log('Dialog result:', selected)

    if (selected) {
      if (selectedPaths.has(selected)) {
        showToast('Path already added')
        console.warn('Duplicate path:', selected)
        return
      }

      selectedPaths.add(selected)

      const pathDisplayEl = document.createElement('div');
      pathDisplayEl.className = 'path-display';

      const pathText = document.createElement('span');
      pathText.className = 'path-text';
      pathText.textContent = selected;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-path-btn';
      removeBtn.textContent = 'REMOVE';
      removeBtn.addEventListener('click', () => {
        removePath(pathDisplayEl, selected)
      });

      pathDisplayEl.appendChild(pathText);
      pathDisplayEl.appendChild(removeBtn);
      pathsContainerEl.appendChild(pathDisplayEl);

      console.log('Path added:', selected)

      /*
      Added by Marco Mattiuz
      // Create a new path display element
      const pathDisplayEl = document.createElement('div');
      pathDisplayEl.className = 'path-display';
      pathDisplayEl.textContent = selected;
      pathsContainerEl.appendChild(pathDisplayEl);

      // Scan the selected path for music files
      const files = await invoke<string[]>('scan_music_files', { path: selected });

      // Count by extension
      const counts: Record<string, number> = {};
      for (const f of files) {
        const ext = f.split('.').pop()?.toLowerCase() ?? 'unknown';
        counts[ext] = (counts[ext] ?? 0) + 1;
      }
      const lines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([ext, n]) => `.${ext}: ${n}`);
      showToast(`${files.length} songs found\n${lines.join('  ·  ')}`);
      */
     
    } else {
      console.log('No path selected')
    }
  } catch (error) {
    console.error('Error selecting path:', error)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  pathsContainerEl = document.querySelector('.paths-container')!
  addPathBtnEl = document.querySelector('.add-path-btn')!
  toastEl = document.querySelector('.toast')!

  console.log('Elements found:', {
    pathsContainer: pathsContainerEl,
    addPathBtn: addPathBtnEl,
    toast: toastEl
  })

  addPathBtnEl.addEventListener('click', () => {
    console.log('Add path button clicked')
    selectPath()
  })

  console.log('RetroTunes app initialized')
})
