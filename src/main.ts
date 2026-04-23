import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'

let pathsContainerEl: HTMLElement;
let addPathBtnEl: HTMLElement;

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
      // Create a new path display element
      const pathDisplayEl = document.createElement('div');
      pathDisplayEl.className = 'path-display';
      pathDisplayEl.textContent = selected;

      // Add it to the container
      pathsContainerEl.appendChild(pathDisplayEl);

      console.log('Path added:', selected)
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

  console.log('Elements found:', {
    pathsContainer: pathsContainerEl,
    addPathBtn: addPathBtnEl
  })

  addPathBtnEl.addEventListener('click', () => {
    console.log('Add path button clicked')
    selectPath()
  })

  console.log('RetroTunes app initialized')
})
