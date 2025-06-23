/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI} from '@google/genai';
import { initQuiz, handleStartQuizClickExport, getQuizIsActiveState } from './quiz.js'; // .js due to compilation
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.js';
import mammoth from 'mammoth';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
    // pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
    // Directly use the CDN URL for the worker, consistent with the import map
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.js';
}


export interface Flashcard { // Exporting for quiz.ts
  term: string;
  definition: string;
}

interface SavedDeck {
  name: string;
  topic: string;
  timestamp: number;
  cards: Flashcard[];
}

// Main UI Elements
const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const numFlashcardsInput = document.getElementById('numFlashcardsInput') as HTMLInputElement;
const numQuizQuestionsInput = document.getElementById('numQuizQuestionsInput') as HTMLInputElement;
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const saveDeckButton = document.getElementById('saveDeckButton') as HTMLButtonElement;
const viewSavedDecksButton = document.getElementById('viewSavedDecksButton') as HTMLButtonElement;
const startQuizButton = document.getElementById('startQuizButton') as HTMLButtonElement;
const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const escalateDifficultyCheckbox = document.getElementById('escalateDifficultyCheckbox') as HTMLInputElement;
const generationControlsDiv = document.getElementById('generationControls') as HTMLDivElement;
const mainTitle = document.getElementById('mainTitle') as HTMLHeadingElement;
const mainDescription = document.getElementById('mainDescription') as HTMLParagraphElement;

// File Upload Elements
const fileUploadInput = document.getElementById('fileUploadInput') as HTMLInputElement;
const generateFromFileButton = document.getElementById('generateFromFileButton') as HTMLButtonElement;
const fileNameDisplay = document.getElementById('fileNameDisplay') as HTMLSpanElement;

// Manual Card Add Elements
const manualTermInput = document.getElementById('manualTermInput') as HTMLInputElement;
const manualDefinitionInput = document.getElementById('manualDefinitionInput') as HTMLTextAreaElement;
const addManualCardButton = document.getElementById('addManualCardButton') as HTMLButtonElement;

// Saved Decks Modal elements
const savedDecksModal = document.getElementById('savedDecksModal') as HTMLDivElement;
const modalCloseButton = document.getElementById('modalCloseButton') as HTMLButtonElement;
const savedDecksListUl = document.getElementById('savedDecksList') as HTMLUListElement;

// Deck Name Input Modal elements
const deckNameModal = document.getElementById('deckNameModal') as HTMLDivElement;
const deckNameModalCloseButton = document.getElementById('deckNameModalCloseButton') as HTMLButtonElement;
const deckNameInputModal = document.getElementById('deckNameInputModal') as HTMLInputElement;
const confirmSaveDeckButton = document.getElementById('confirmSaveDeckButton') as HTMLButtonElement;
const cancelSaveDeckButtonModal = document.getElementById('cancelSaveDeckButtonModal') as HTMLButtonElement;

// Quiz UI Elements (to be passed to quiz.ts)
const quizModeContainer = document.getElementById('quizModeContainer') as HTMLDivElement;
const quizPreparationMessage = document.getElementById('quizPreparationMessage') as HTMLDivElement;
const quizQuestionArea = document.getElementById('quizQuestionArea') as HTMLDivElement;
const quizProgress = document.getElementById('quizProgress') as HTMLDivElement;
const quizTerm = document.getElementById('quizTerm') as HTMLDivElement;
const quizOptions = document.getElementById('quizOptions') as HTMLDivElement;
const quizFeedback = document.getElementById('quizFeedback') as HTMLDivElement;
const quizControls = document.getElementById('quizControls') as HTMLDivElement;
const nextQuizQuestionButton = document.getElementById('nextQuizQuestionButton') as HTMLButtonElement;
const finishQuizButton = document.getElementById('finishQuizButton') as HTMLButtonElement;
const quizSummary = document.getElementById('quizSummary') as HTMLDivElement;
const quizFinalScore = document.getElementById('quizFinalScore') as HTMLParagraphElement;
const retryQuizButton = document.getElementById('retryQuizButton') as HTMLButtonElement;
const backToFlashcardsButton = document.getElementById('backToFlashcardsButton') as HTMLButtonElement;


const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const FLASHCARD_DECKS_KEY = 'flashcardApp_savedDecks';

let allFlashcards: Flashcard[] = [];
let generatedTerms = new Set<string>();
let escalateDifficultyMode = false;
let selectedFile: File | null = null;


function parseFlashcardsFromText(text: string): Flashcard[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split(':');
      if (parts.length >= 2 && parts[0].trim()) {
        const term = parts[0].trim();
        const definition = parts.slice(1).join(':').trim();
        if (definition) {
          return {term, definition};
        }
      }
      return null;
    })
    .filter((card): card is Flashcard => card !== null);
}

function updateMainControlsState(): void {
  const hasFlashcards = allFlashcards.length > 0;
  const quizIsActive = getQuizIsActiveState(); // Get state from quiz module
  const isGenerating = generateButton.disabled && (errorMessage.textContent?.includes('Generating') || errorMessage.textContent?.includes('Extracting') || errorMessage.textContent?.includes('Reading file'));


  saveDeckButton.disabled = !hasFlashcards || quizIsActive || isGenerating;
  startQuizButton.disabled = !hasFlashcards || quizIsActive || isGenerating;

  generateButton.disabled = quizIsActive || isGenerating;
  generateFromFileButton.disabled = quizIsActive || isGenerating || !selectedFile;
  viewSavedDecksButton.disabled = quizIsActive || isGenerating;
  topicInput.disabled = quizIsActive || isGenerating;
  numFlashcardsInput.disabled = quizIsActive || isGenerating;
  numQuizQuestionsInput.disabled = quizIsActive || isGenerating;
  escalateDifficultyCheckbox.disabled = quizIsActive || isGenerating;
  fileUploadInput.disabled = quizIsActive || isGenerating;

  manualTermInput.disabled = quizIsActive || isGenerating;
  manualDefinitionInput.disabled = quizIsActive || isGenerating;
  addManualCardButton.disabled = quizIsActive || isGenerating;
}


function displayFlashcards(cards: Flashcard[]): void {
  flashcardsContainer.innerHTML = '';

  if (cards.length === 0) {
    // Retain specific messages related to generation, quiz, load, delete etc.
    if (!errorMessage.textContent?.match(/generating|generated|loaded|deleted|remaining|error|quiz|file|extracting|manual/i)) {
      // errorMessage.textContent = 'No flashcards to display.';
    }
  }

  cards.forEach((flashcard, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('flashcard');
    cardDiv.setAttribute('aria-label', `Flashcard: ${flashcard.term}. Click or press Enter to flip.`);
    cardDiv.setAttribute('role', 'group');
    cardDiv.tabIndex = 0;

    const cardInner = document.createElement('div');
    cardInner.classList.add('flashcard-inner');

    const cardFront = document.createElement('div');
    cardFront.classList.add('flashcard-front');
    const termDiv = document.createElement('div');
    termDiv.classList.add('term');
    termDiv.textContent = flashcard.term;
    cardFront.appendChild(termDiv);

    const cardBack = document.createElement('div');
    cardBack.classList.add('flashcard-back');
    const definitionDiv = document.createElement('div');
    definitionDiv.classList.add('definition');
    definitionDiv.textContent = flashcard.definition;
    cardBack.appendChild(definitionDiv);

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardDiv.appendChild(cardInner);

    const deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-button');
    deleteButton.innerHTML = '&times;';
    deleteButton.setAttribute('aria-label', `Delete flashcard: ${flashcard.term}`);
    deleteButton.title = `Delete flashcard: ${flashcard.term}`;

    deleteButton.addEventListener('click', async (event) => {
      console.log(`[Delete Card] Clicked to delete card. Index: ${index}, Term: "${flashcard.term}"`);
      event.stopPropagation();

      if (index < 0 || index >= allFlashcards.length || allFlashcards[index].term !== flashcard.term) {
          console.error(`[Delete Card] Mismatch or invalid index. Card might have been already removed or list changed. Index: ${index}, Expected term: ${flashcard.term}`);
          displayFlashcards(allFlashcards);
          return;
      }

      const deletedFlashcard = {...allFlashcards[index]};
      allFlashcards.splice(index, 1);
      generatedTerms.delete(deletedFlashcard.term.toLowerCase());

      const desiredNumber = parseInt(numFlashcardsInput.value, 10);
      const currentTopic = topicInput.value.trim();
      displayFlashcards(allFlashcards);

      if (currentTopic && !isNaN(desiredNumber) && desiredNumber > 0 && allFlashcards.length < desiredNumber && !selectedFile) { // Only auto-generate if topic was source, not file/manual
        let message = `Attempting to generate ${desiredNumber - allFlashcards.length} more card(s) for "${currentTopic}"...`;
        if(escalateDifficultyMode) {
            message = `Escalating difficulty. Generating 1 more complex card for "${currentTopic}" to replace "${deletedFlashcard.term}"...`;
            if (desiredNumber - allFlashcards.length > 1) {
                message += ` and ${desiredNumber - allFlashcards.length -1} other new card(s).`;
            }
        }
        errorMessage.textContent = message;

        if (escalateDifficultyMode) {
          await generateAndAddFlashcards(desiredNumber, { topic: currentTopic, escalateFrom: deletedFlashcard });
        } else {
          await generateAndAddFlashcards(desiredNumber, { topic: currentTopic });
        }
      } else {
        if (allFlashcards.length > 0) {
          errorMessage.textContent = `${allFlashcards.length} flashcards remaining.`;
        } else {
          errorMessage.textContent = 'All flashcards deleted. Generate new ones or add manually?';
        }
        updateMainControlsState();
      }
    });
    cardDiv.appendChild(deleteButton);

    const flipCard = () => cardDiv.classList.toggle('flipped');
    cardInner.addEventListener('click', flipCard);
    cardDiv.addEventListener('keydown', (event) => {
      if (document.activeElement === deleteButton && (event.key === 'Enter' || event.key === ' ')) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        flipCard();
        event.preventDefault();
      }
    });
    flashcardsContainer.appendChild(cardDiv);
  });
  updateMainControlsState();
}

async function generateAndAddFlashcards(
  targetTotalCount: number,
  source: { topic?: string; documentText?: string; escalateFrom?: Flashcard; sourceFileName?: string }
): Promise<void> {
  generateButton.disabled = true;
  generateFromFileButton.disabled = true;
  addManualCardButton.disabled = true; // Disable manual add during API generation
  saveDeckButton.disabled = true;
  startQuizButton.disabled = true;
  updateMainControlsState();

  const MAX_TOTAL_API_CALLS = 25;
  let apiCallsMade = 0;
  const MAX_CONSECUTIVE_EMPTY_CALLS = 3;
  let consecutiveEmptyCalls = 0;
  const MAX_PROMPT_TERMS_TO_MENTION = 30;
  let generatedEscalatedCard = false;

  const baseTopic = source.topic || (source.sourceFileName ? `content from ${source.sourceFileName}` : 'the provided text');

  try {
    while (
      allFlashcards.length < targetTotalCount &&
      apiCallsMade < MAX_TOTAL_API_CALLS &&
      consecutiveEmptyCalls < MAX_CONSECUTIVE_EMPTY_CALLS
    ) {
      apiCallsMade++;
      let numToAttemptNow = Math.min(20, targetTotalCount - allFlashcards.length);
      if (numToAttemptNow <= 0) break;

      let currentPrompt = '';
      const isEscalationAttempt = source?.escalateFrom && !generatedEscalatedCard;
      const existingTermsArray = Array.from(generatedTerms);
      const termsToMentionSample = existingTermsArray.sort(() => 0.5 - Math.random()).slice(0, MAX_PROMPT_TERMS_TO_MENTION);
      const termsToMentionInPrompt = termsToMentionSample.join('", "');

      if (isEscalationAttempt && source?.escalateFrom) {
        numToAttemptNow = 1;
        const deletedCard = source.escalateFrom;
        currentPrompt = `The user is studying based on "${baseTopic}".
They just deleted a flashcard: Term: "${deletedCard.term}", Definition: "${deletedCard.definition}".
Generate **one new flashcard** that is related to "${baseTopic}" but is **more complex, advanced, or represents a logical next step in learning** compared to the deleted flashcard.
The new flashcard must introduce a new concept or term. Do NOT generate a flashcard for "${deletedCard.term}" again.
Avoid simple rephrasing or direct synonyms of "${deletedCard.term}".
Also, avoid generating any of these already existing terms: ["${termsToMentionInPrompt}"].
Format the output as "Term: Definition" on a single new line.
Example of desired output format:
More Advanced Term: Definition for this more advanced term.`;
        if (source.documentText) currentPrompt += `\n\nContextual Document Text (for reference, focus on generating a new, more complex card related to deleted one but can be inspired by this text):\n${source.documentText.substring(0, 2000)}...`;
        errorMessage.textContent = `Generating 1 more complex card for "${baseTopic}" to replace "${deletedCard.term}"... (API call ${apiCallsMade})`;
      } else if (source.documentText) {
        errorMessage.textContent = `Generating flashcards from document... (${allFlashcards.length} of ${targetTotalCount} generated, API call ${apiCallsMade})`;
        currentPrompt = `Based on the following document content, generate ${numToAttemptNow} flashcards.
Focus on key terms, concepts, and their definitions found within the text.
Each flashcard must introduce a **distinctly new term/concept** not already covered by these existing terms: ["${termsToMentionInPrompt}"].
Format each flashcard as "Term: Definition" on a new line. Each term and definition must be concise and clearly separated by a single colon.
Document Content:
---
${source.documentText}
---
Example of desired output format:
New Term1: New Definition1 for New Term1
New Term2: New Definition2 for New Term2`;
      } else { // Topic based
        errorMessage.textContent = `Generating flashcards for "${baseTopic}"... (${allFlashcards.length} of ${targetTotalCount} generated, API call ${apiCallsMade})`;
        currentPrompt = `Generate ${numToAttemptNow} flashcards on the topic of "${baseTopic}".
These flashcards must introduce **distinctly new terms and concepts** that are different from the following already generated terms: ["${termsToMentionInPrompt}"].
Do not provide slight variations or rephrasing of the existing terms. Focus on covering different aspects or sub-topics of "${baseTopic}" that have not yet been touched upon.
Format each flashcard as "Term: Definition" on a new line. Each term and definition must be concise and clearly separated by a single colon.
Example of desired output format:
New Term1: New Definition1 for New Term1
New Term2: New Definition2 for New Term2`;
      }

      const result = await ai.models.generateContent({ model: MODEL_NAME, contents: currentPrompt });
      const responseText = result?.text ?? '';
      const parsedCardsFromResponse = parseFlashcardsFromText(responseText);
      let newUniqueCardsThisCallCount = 0;

      for (const card of parsedCardsFromResponse) {
        if (allFlashcards.length < targetTotalCount && !generatedTerms.has(card.term.toLowerCase())) {
          allFlashcards.push(card);
          generatedTerms.add(card.term.toLowerCase());
          newUniqueCardsThisCallCount++;
        }
        if (allFlashcards.length >= targetTotalCount) break;
      }

      if (isEscalationAttempt) generatedEscalatedCard = true;
      if (newUniqueCardsThisCallCount === 0) {
         if (responseText.trim() !== "" || apiCallsMade > 1) consecutiveEmptyCalls++;
      } else {
        consecutiveEmptyCalls = 0;
      }

      const generatingMsgBase = source.documentText ? `Generating flashcards from document` : `Generating flashcards for "${baseTopic}"`;
      if (isEscalationAttempt && newUniqueCardsThisCallCount > 0) {
        errorMessage.textContent = `Generated more complex card. Now at ${allFlashcards.length} of ${targetTotalCount}.`;
      } else if (isEscalationAttempt && newUniqueCardsThisCallCount === 0) {
        errorMessage.textContent = `Could not generate more complex card. Now at ${allFlashcards.length} of ${targetTotalCount}.`;
      } else {
        errorMessage.textContent = `${generatingMsgBase}... (${allFlashcards.length} of ${targetTotalCount} generated, API call ${apiCallsMade})`;
      }
      displayFlashcards(allFlashcards);
      if (allFlashcards.length >= targetTotalCount) break;
    }

    if (allFlashcards.length > 0) {
      errorMessage.textContent = allFlashcards.length < targetTotalCount
        ? `Generated ${allFlashcards.length} of ${targetTotalCount} flashcards. Could not generate more unique cards for "${baseTopic}".`
        : `Successfully generated ${allFlashcards.length} flashcards for "${baseTopic}"!`;
    } else if (apiCallsMade > 0) {
        errorMessage.textContent = `No flashcards could be generated for "${baseTopic}". Please try a different source or adjust the number.`;
    }
    displayFlashcards(allFlashcards);
  } catch (error: unknown) {
    console.error('[Gen&Add] Error during content generation:', error);
    const detailedError = (error as Error)?.message || 'An unknown error occurred';
    errorMessage.textContent = `An error occurred while generating: ${detailedError}.`;
    displayFlashcards(allFlashcards);
  } finally {
    updateMainControlsState();
  }
}

async function handleFileAndGenerate() {
    if (!selectedFile) {
        errorMessage.textContent = 'Please select a file first.';
        return;
    }

    const desiredNumber = parseInt(numFlashcardsInput.value, 10);
    if (isNaN(desiredNumber) || desiredNumber < 1 || desiredNumber > 500) {
        errorMessage.textContent = 'Please enter a valid number of flashcards (1-500).';
        return;
    }

    allFlashcards = [];
    generatedTerms.clear();
    displayFlashcards(allFlashcards);
    topicInput.value = ''; // Clear topic input when generating from file

    errorMessage.textContent = `Reading file: ${selectedFile.name}...`;
    updateMainControlsState(); // Disable buttons

    try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        let extractedText = '';

        if (selectedFile.type === 'application/pdf') {
            errorMessage.textContent = `Extracting text from PDF: ${selectedFile.name}...`;
            const pdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                extractedText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
            }
        } else if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // DOCX
            errorMessage.textContent = `Extracting text from DOCX: ${selectedFile.name}...`;
            const result = await mammoth.extractRawText({arrayBuffer});
            extractedText = result.value;
        } else if (selectedFile.name.toLowerCase().endsWith('.pptx')) {
            errorMessage.textContent = 'PPTX processing is complex and not fully supported for direct text extraction yet. Please try PDF, DOCX, or copy-paste text.';
            updateMainControlsState();
            return;
        } else {
            errorMessage.textContent = `Unsupported file type: ${selectedFile.type || selectedFile.name.split('.').pop()}. Please use PDF or DOCX.`;
            updateMainControlsState();
            return;
        }

        if (!extractedText.trim()) {
            errorMessage.textContent = `Could not extract any text from ${selectedFile.name}. The file might be empty, image-based, or corrupted.`;
            updateMainControlsState();
            return;
        }

        console.log(`Extracted text length: ${extractedText.length}`);
        errorMessage.textContent = `Generating flashcards from ${selectedFile.name}... (0 of ${desiredNumber} generated)`;
        await generateAndAddFlashcards(desiredNumber, { documentText: extractedText, sourceFileName: selectedFile.name });

    } catch (error) {
        console.error('Error processing file:', error);
        const detailedError = (error as Error)?.message || 'An unknown error occurred during file processing.';
        errorMessage.textContent = `Error: ${detailedError}`;
        updateMainControlsState(); // Re-enable controls
    }
}

function handleAddManualCardClick() {
  const term = manualTermInput.value.trim();
  const definition = manualDefinitionInput.value.trim();

  if (!term || !definition) {
    errorMessage.textContent = 'Both term and definition are required for manual entry.';
    return;
  }

  if (generatedTerms.has(term.toLowerCase())) {
    errorMessage.textContent = `The term "${term}" already exists. Please enter a unique term.`;
    return;
  }

  const newCard: Flashcard = { term, definition };
  allFlashcards.push(newCard);
  generatedTerms.add(term.toLowerCase());

  displayFlashcards(allFlashcards);
  manualTermInput.value = '';
  manualDefinitionInput.value = '';
  errorMessage.textContent = `Manually added card: "${term}".`;
  updateMainControlsState();
}

// Function to get all flashcards (for quiz module)
function getAllFlashcards(): Flashcard[] {
  return allFlashcards;
}
// Function to get current topic (for quiz module)
function getCurrentTopic(): string {
  return topicInput.value.trim();
}
// Function to update main controls (for quiz module)
function updateAppControls() {
  updateMainControlsState();
}
// Function to display flashcards (for quiz module)
function displayAppFlashcards(cards: Flashcard[]) {
  displayFlashcards(cards);
}
// Function to show error message (for quiz module)
function showAppErrorMessage(message: string) {
  errorMessage.textContent = message;
}
// Getter functions for quiz module to control main UI visibility
function getAppFlashcardsContainer(): HTMLDivElement { return flashcardsContainer; }
function getAppGenerationControlsDiv(): HTMLDivElement { return generationControlsDiv; }
function getAppMainTitle(): HTMLHeadingElement { return mainTitle; }
function getAppMainDescription(): HTMLParagraphElement { return mainDescription; }


// Deck Saving and Loading
function showDeckNameModal() {
  deckNameInputModal.value = topicInput.value.trim() || `Deck Saved on ${new Date().toLocaleDateString()}`;
  deckNameModal.style.display = 'flex';
  deckNameInputModal.focus();
}

function closeDeckNameModal() {
  deckNameModal.style.display = 'none';
}

function saveCurrentDeck(deckName: string) {
  if (!deckName.trim()) {
    errorMessage.textContent = 'Deck name cannot be empty.';
    return;
  }
  if (allFlashcards.length === 0) {
    errorMessage.textContent = 'No flashcards to save.';
    return;
  }

  const newDeck: SavedDeck = {
    name: deckName.trim(),
    topic: topicInput.value.trim() || 'Untitled Deck',
    timestamp: Date.now(),
    cards: [...allFlashcards]
  };

  try {
    const savedDecks = getSavedDecks();
    savedDecks.push(newDeck);
    localStorage.setItem(FLASHCARD_DECKS_KEY, JSON.stringify(savedDecks));
    errorMessage.textContent = `Deck "${newDeck.name}" saved successfully!`;
    closeDeckNameModal();
  } catch (error) {
    console.error("Error saving deck to localStorage:", error);
    errorMessage.textContent = "Could not save deck. LocalStorage might be full or disabled.";
    // Potentially offer more specific error messages based on `error.name` (e.g., 'QuotaExceededError')
  }
}

function getSavedDecks(): SavedDeck[] {
  try {
    const decksJson = localStorage.getItem(FLASHCARD_DECKS_KEY);
    return decksJson ? JSON.parse(decksJson) : [];
  } catch (error) {
    console.error("Error reading decks from localStorage:", error);
    errorMessage.textContent = "Could not read saved decks. Data might be corrupted.";
    return []; // Return empty array on error
  }
}

function displaySavedDecks() {
  savedDecksListUl.innerHTML = '';
  const decks = getSavedDecks().sort((a,b) => b.timestamp - a.timestamp); // Sort by newest first

  if (decks.length === 0) {
    savedDecksListUl.innerHTML = '<li>No saved decks found.</li>';
    return;
  }

  decks.forEach((deck, index) => {
    const li = document.createElement('li');
    li.setAttribute('aria-label', `Saved deck: ${deck.name}`);

    const infoDiv = document.createElement('div');
    infoDiv.classList.add('deck-info');
    infoDiv.innerHTML = `
      <strong>${deck.name}</strong>
      <span>Topic: ${deck.topic || 'N/A'}</span>
      <span>Cards: ${deck.cards.length}</span>
      <span>Saved: ${new Date(deck.timestamp).toLocaleString()}</span>
    `;

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('deck-actions');

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load Deck';
    loadButton.classList.add('load-deck-button');
    loadButton.setAttribute('aria-label', `Load deck: ${deck.name}`);
    loadButton.addEventListener('click', () => {
      loadDeck(deck);
      savedDecksModal.style.display = 'none';
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Deck';
    deleteButton.classList.add('delete-deck-button');
    deleteButton.setAttribute('aria-label', `Delete deck: ${deck.name}`);
    deleteButton.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete the deck "${deck.name}"? This cannot be undone.`)) {
        deleteDeck(index); // Using index from sorted list might be error-prone if original list changes; better to use unique ID or filter by timestamp/name
        displaySavedDecks(); // Refresh list
      }
    });

    actionsDiv.appendChild(loadButton);
    actionsDiv.appendChild(deleteButton);
    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    savedDecksListUl.appendChild(li);
  });
}

function loadDeck(deck: SavedDeck) {
  topicInput.value = deck.topic;
  allFlashcards = [...deck.cards];
  generatedTerms.clear();
  allFlashcards.forEach(card => generatedTerms.add(card.term.toLowerCase()));
  numFlashcardsInput.value = deck.cards.length.toString();
  selectedFile = null;
  fileNameDisplay.textContent = 'No file selected.';
  fileUploadInput.value = ''; // Clear file input

  displayFlashcards(allFlashcards);
  errorMessage.textContent = `Loaded deck: "${deck.name}" with ${deck.cards.length} cards.`;
  updateMainControlsState();
}

// Improved deleteDeck to use a more stable identifier (timestamp for uniqueness)
function deleteDeck(deckTimestamp: number) {
  let savedDecks = getSavedDecks();
  const initialLength = savedDecks.length;
  savedDecks = savedDecks.filter(deck => deck.timestamp !== deckTimestamp);

  if (savedDecks.length < initialLength) {
    try {
      localStorage.setItem(FLASHCARD_DECKS_KEY, JSON.stringify(savedDecks));
      errorMessage.textContent = 'Deck deleted successfully.';
    } catch (error) {
      console.error("Error saving updated decks to localStorage:", error);
      errorMessage.textContent = "Could not delete deck. LocalStorage might be full or disabled.";
    }
  } else {
    errorMessage.textContent = 'Deck not found for deletion.'; // Should ideally not happen if UI is synced
  }
  displaySavedDecks(); // Refresh list in modal
}
// Modify the event listener for delete button in displaySavedDecks to pass timestamp
// (This requires a change in displaySavedDecks)

// Re-write displaySavedDecks to use timestamp for deleteDeck
function displaySavedDecksUpdated() {
  savedDecksListUl.innerHTML = '';
  const decks = getSavedDecks().sort((a,b) => b.timestamp - a.timestamp);

  if (decks.length === 0) {
    savedDecksListUl.innerHTML = '<li>No saved decks found.</li>';
    return;
  }

  decks.forEach((deck) => { // Removed index, will use deck.timestamp
    const li = document.createElement('li');
    li.setAttribute('aria-label', `Saved deck: ${deck.name}`);

    const infoDiv = document.createElement('div');
    infoDiv.classList.add('deck-info');
    infoDiv.innerHTML = `
      <strong>${deck.name}</strong>
      <span>Topic: ${deck.topic || 'N/A'}</span>
      <span>Cards: ${deck.cards.length}</span>
      <span>Saved: ${new Date(deck.timestamp).toLocaleString()}</span>
    `;

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('deck-actions');

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load Deck';
    loadButton.classList.add('load-deck-button');
    loadButton.setAttribute('aria-label', `Load deck: ${deck.name}`);
    loadButton.addEventListener('click', () => {
      loadDeck(deck);
      savedDecksModal.style.display = 'none';
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Deck';
    deleteButton.classList.add('delete-deck-button');
    deleteButton.setAttribute('aria-label', `Delete deck: ${deck.name}`);
    deleteButton.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete the deck "${deck.name}"? This cannot be undone.`)) {
        deleteDeck(deck.timestamp); // Pass timestamp here
        // displaySavedDecksUpdated(); // deleteDeck now calls this itself, or should if it modifies data
      }
    });

    actionsDiv.appendChild(loadButton);
    actionsDiv.appendChild(deleteButton);
    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    savedDecksListUl.appendChild(li);
  });
}



// Event Listeners
generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  const numFlashcards = parseInt(numFlashcardsInput.value, 10);

  if (!topic && !topicInput.placeholder.includes('Term: Definition')) { // If placeholder implies direct entry, topic can be empty
    errorMessage.textContent = 'Please enter a topic or paste "Term: Definition" pairs.';
    return;
  }
  if (isNaN(numFlashcards) || numFlashcards < 1 || numFlashcards > 500) {
    errorMessage.textContent = 'Please enter a valid number of flashcards (1-500).';
    return;
  }
  
  allFlashcards = [];
  generatedTerms.clear();
  selectedFile = null; // Clear selected file if generating from topic
  fileNameDisplay.textContent = 'No file selected.';
  fileUploadInput.value = '';

  // Check if topicInput contains "Term: Definition" pairs
  const lines = topic.split('\n').filter(line => line.trim() !== '');
  const potentialManualCards = parseFlashcardsFromText(topic);

  if (potentialManualCards.length > 0 && potentialManualCards.length === lines.length) { // Check if all lines parsed successfully
      errorMessage.textContent = `Pasted ${potentialManualCards.length} cards.`;
      allFlashcards = potentialManualCards;
      potentialManualCards.forEach(card => generatedTerms.add(card.term.toLowerCase()));
      displayFlashcards(allFlashcards);
      updateMainControlsState();
      topicInput.value = ''; // Clear input after parsing
  } else {
      displayFlashcards(allFlashcards); // Clear display
      errorMessage.textContent = `Generating ${numFlashcards} flashcards for "${topic}"... (0 of ${numFlashcards} generated)`;
      await generateAndAddFlashcards(numFlashcards, { topic });
  }
});

fileUploadInput.addEventListener('change', (event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
        selectedFile = files[0];
        fileNameDisplay.textContent = `Selected: ${selectedFile.name}`;
        generateFromFileButton.disabled = false; // Enable button
        topicInput.value = ''; // Clear topic if a file is chosen
        allFlashcards = []; // Clear current flashcards
        generatedTerms.clear();
        displayFlashcards([]);
        errorMessage.textContent = 'File selected. Click "Generate from File".';
    } else {
        selectedFile = null;
        fileNameDisplay.textContent = 'No file selected.';
        generateFromFileButton.disabled = true; // Disable button
    }
    updateMainControlsState();
});

generateFromFileButton.addEventListener('click', handleFileAndGenerate);
addManualCardButton.addEventListener('click', handleAddManualCardClick);


saveDeckButton.addEventListener('click', showDeckNameModal);
confirmSaveDeckButton.addEventListener('click', () => {
  const deckName = deckNameInputModal.value;
  saveCurrentDeck(deckName);
});
deckNameModalCloseButton.addEventListener('click', closeDeckNameModal);
cancelSaveDeckButtonModal.addEventListener('click', closeDeckNameModal);


viewSavedDecksButton.addEventListener('click', () => {
  displaySavedDecksUpdated(); // Use the updated function
  savedDecksModal.style.display = 'flex';
});
modalCloseButton.addEventListener('click', () => {
  savedDecksModal.style.display = 'none';
});

escalateDifficultyCheckbox.addEventListener('change', (event) => {
  escalateDifficultyMode = (event.target as HTMLInputElement).checked;
  console.log("Escalate difficulty mode:", escalateDifficultyMode);
});

// Initialize Quiz Module
initQuiz(
  ai,
  MODEL_NAME,
  { 
    quizModeContainer, quizPreparationMessage, quizQuestionArea, quizProgress, quizTerm, quizOptions, 
    quizFeedback, quizControls, nextQuizQuestionButton, finishQuizButton, quizSummary, 
    quizFinalScore, retryQuizButton, backToFlashcardsButton, numQuizQuestionsInput 
  },
  getAllFlashcards,
  getCurrentTopic,
  updateAppControls,
  displayAppFlashcards,
  showAppErrorMessage,
  getAppFlashcardsContainer,
  getAppGenerationControlsDiv,
  getAppMainTitle,
  getAppMainDescription
);

startQuizButton.addEventListener('click', handleStartQuizClickExport);


// Initial state
updateMainControlsState();
errorMessage.textContent = 'Enter a topic or upload a file to start.';
displayFlashcards([]);
if (numQuizQuestionsInput) numQuizQuestionsInput.value = "0"; // Default to all questions for quiz
if (numFlashcardsInput) numFlashcardsInput.value = "10";
console.log("Flashcard App Initialized");
