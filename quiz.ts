/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import type { Flashcard } from './index.js'; // Import Flashcard type

interface QuizQuestion extends Flashcard {
  options: string[]; // Shuffled: correct definition + 3 distractors
}

interface QuizUIElements {
  quizModeContainer: HTMLDivElement;
  quizPreparationMessage: HTMLDivElement;
  quizQuestionArea: HTMLDivElement;
  quizProgress: HTMLDivElement;
  quizTerm: HTMLDivElement;
  quizOptions: HTMLDivElement;
  quizFeedback: HTMLDivElement;
  quizControls: HTMLDivElement;
  nextQuizQuestionButton: HTMLButtonElement;
  finishQuizButton: HTMLButtonElement;
  quizSummary: HTMLDivElement;
  quizFinalScore: HTMLParagraphElement;
  retryQuizButton: HTMLButtonElement;
  backToFlashcardsButton: HTMLButtonElement;
  numQuizQuestionsInput: HTMLInputElement;
}

let currentQuizQuestions: QuizQuestion[] = [];
let currentQuizQuestionIndex = 0;
let currentQuizScore = 0;
let quizIsActive = false;

// Dependencies injected by initQuiz
let aiInstance: GoogleGenAI;
let geminiModelName: string;
let uiElements: QuizUIElements;
let getAllFlashcardsCallback: () => Flashcard[];
let getCurrentTopicCallback: () => string;
let updateAppControlsCallback: () => void;
let displayAppFlashcardsCallback: (cards: Flashcard[]) => void;
let showAppErrorMessageCallback: (message: string) => void;
let getFlashcardsContainerCallback: () => HTMLDivElement;
let getGenerationControlsDivCallback: () => HTMLDivElement;
let getMainTitleCallback: () => HTMLHeadingElement;
let getMainDescriptionCallback: () => HTMLParagraphElement;


function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

async function prepareQuizData(cardsToQuiz: Flashcard[], topic: string): Promise<QuizQuestion[]> {
  const quizData: QuizQuestion[] = [];
  let questionsPrepared = 0;
  const totalQuestionsToPrepare = cardsToQuiz.length;

  if (totalQuestionsToPrepare === 0) {
    return [];
  }

  for (const card of cardsToQuiz) {
    uiElements.quizPreparationMessage.textContent = `Preparing quiz... (Generating options for question ${questionsPrepared + 1} of ${totalQuestionsToPrepare})`;
    try {
      const prompt = `Given the topic "${topic}", for the term "${card.term}" whose correct definition is "${card.definition}", please generate 3 distinct, plausible but incorrect definitions. These incorrect definitions should be relevant to the topic but clearly not the right answer for the given term. Do not include the correct definition or slight variations of it in your list of incorrect definitions.
Return your response ONLY as a JSON array of 3 strings.
Example: ["Incorrect definition A for ${card.term}", "Incorrect definition B for ${card.term}", "Incorrect definition C for ${card.term}"]`;

      const response: GenerateContentResponse = await aiInstance.models.generateContent({
        model: geminiModelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      
      const distractors = JSON.parse(jsonStr) as string[];
      if (Array.isArray(distractors) && distractors.length === 3 && distractors.every(d => typeof d === 'string')) {
        quizData.push({
          term: card.term,
          definition: card.definition,
          options: shuffleArray([card.definition, ...distractors]),
        });
      } else {
        console.warn(`Could not generate 3 valid distractors for term: ${card.term}. Received:`, distractors);
         // Fallback: create a question with fewer options or skip. For now, skipping.
      }
    } catch (error) {
      console.error(`Error generating distractors for term ${card.term}:`, error);
      // Optionally skip this question or handle error. For now, skipping.
    }
    questionsPrepared++;
  }
  return quizData;
}

function calculateGrade(score: number, total: number): { percentage: number; letter: string } {
  if (total === 0) return { percentage: 0, letter: "N/A" };
  const percentage = (score / total) * 100;
  let letter = "F";
  if (percentage >= 90) letter = "A";
  else if (percentage >= 80) letter = "B";
  else if (percentage >= 70) letter = "C";
  else if (percentage >= 60) letter = "D";
  return { percentage, letter };
}

function displayQuizQuestion() {
  if (currentQuizQuestionIndex >= currentQuizQuestions.length) {
    showQuizSummary();
    return;
  }

  const question = currentQuizQuestions[currentQuizQuestionIndex];
  uiElements.quizTerm.textContent = question.term;
  uiElements.quizOptions.innerHTML = '';
  uiElements.quizFeedback.textContent = '';
  uiElements.quizFeedback.className = 'quiz-feedback-message'; // Reset classes

  question.options.forEach(optionText => {
    const optionButton = document.createElement('button');
    optionButton.classList.add('quiz-option-button');
    optionButton.textContent = optionText;
    optionButton.addEventListener('click', () => handleQuizAnswerSelection(optionText, question.definition));
    uiElements.quizOptions.appendChild(optionButton);
  });

  uiElements.quizProgress.textContent = `Question ${currentQuizQuestionIndex + 1} of ${currentQuizQuestions.length} | Score: ${currentQuizScore}`;
  uiElements.nextQuizQuestionButton.style.display = 'none';
  uiElements.quizQuestionArea.style.display = 'block';
  uiElements.quizControls.style.display = 'flex';
  uiElements.quizSummary.style.display = 'none';
}

function handleQuizAnswerSelection(selectedOption: string, correctAnswer: string) {
  const isCorrect = selectedOption === correctAnswer;
  if (isCorrect) {
    currentQuizScore++;
    uiElements.quizFeedback.textContent = 'Correct!';
    uiElements.quizFeedback.classList.add('correct');
  } else {
    uiElements.quizFeedback.textContent = `Incorrect. The correct answer was: ${correctAnswer}`;
    uiElements.quizFeedback.classList.add('incorrect');
  }

  Array.from(uiElements.quizOptions.children).forEach(child => {
    const button = child as HTMLButtonElement;
    button.disabled = true;
    if (button.textContent === correctAnswer) {
      button.classList.add('correct');
    } else if (button.textContent === selectedOption && !isCorrect) {
      button.classList.add('incorrect');
    }
  });

  uiElements.quizProgress.textContent = `Question ${currentQuizQuestionIndex + 1} of ${currentQuizQuestions.length} | Score: ${currentQuizScore}`;
  uiElements.nextQuizQuestionButton.style.display = 'inline-block';
}

function handleNextQuizQuestion() {
  currentQuizQuestionIndex++;
  if (currentQuizQuestionIndex < currentQuizQuestions.length) {
    displayQuizQuestion();
  } else {
    showQuizSummary();
  }
}

function showQuizSummary() {
  uiElements.quizQuestionArea.style.display = 'none';
  uiElements.quizControls.style.display = 'none'; 
  uiElements.quizSummary.style.display = 'block';
  
  const grade = calculateGrade(currentQuizScore, currentQuizQuestions.length);
  uiElements.quizFinalScore.innerHTML = `You scored ${currentQuizScore} out of ${currentQuizQuestions.length}!<br>Percentage: ${grade.percentage.toFixed(1)}%<br>Grade: ${grade.letter}`;
}

function endQuiz() {
  quizIsActive = false;
  uiElements.quizModeContainer.style.display = 'none';
  uiElements.quizPreparationMessage.style.display = 'none';
  
  getFlashcardsContainerCallback().style.display = 'flex';
  getGenerationControlsDivCallback().style.display = 'block';
  getMainTitleCallback().style.display = 'block';
  getMainDescriptionCallback().style.display = 'block';
  
  const allFlashcards = getAllFlashcardsCallback();
  showAppErrorMessageCallback(allFlashcards.length > 0 ? `${allFlashcards.length} flashcards in current deck.` : 'No flashcards loaded. Generate some!');
  updateAppControlsCallback();
  displayAppFlashcardsCallback(allFlashcards); 
}

function retryQuiz() {
  currentQuizQuestionIndex = 0;
  currentQuizScore = 0;
  uiElements.quizSummary.style.display = 'none';
  uiElements.quizPreparationMessage.style.display = 'none'; 
  // Questions are already prepared, just display the first one
  displayQuizQuestion();
}

async function handleStartQuizClickInternal() {
  const allFlashcards = getAllFlashcardsCallback();
  if (allFlashcards.length === 0) {
    showAppErrorMessageCallback('Please generate or load flashcards before starting a quiz.');
    return;
  }

  quizIsActive = true;
  updateAppControlsCallback();

  getFlashcardsContainerCallback().style.display = 'none';
  getGenerationControlsDivCallback().style.display = 'none';
  getMainTitleCallback().style.display = 'none';
  getMainDescriptionCallback().style.display = 'none';
  showAppErrorMessageCallback(''); 

  uiElements.quizModeContainer.style.display = 'block';
  uiElements.quizQuestionArea.style.display = 'none';
  uiElements.quizControls.style.display = 'none';
  uiElements.quizSummary.style.display = 'none';
  uiElements.quizPreparationMessage.style.display = 'block';
  uiElements.quizPreparationMessage.textContent = 'Preparing your quiz... please wait.';

  let numQuestionsRequested = parseInt(uiElements.numQuizQuestionsInput.value, 10);
  if (isNaN(numQuestionsRequested) || numQuestionsRequested <= 0 || numQuestionsRequested > allFlashcards.length) {
    numQuestionsRequested = allFlashcards.length;
  }
  
  const shuffledCards = shuffleArray([...allFlashcards]);
  const cardsForQuiz = shuffledCards.slice(0, numQuestionsRequested);
  
  const topicForQuiz = getCurrentTopicCallback() || "General Knowledge";
  currentQuizQuestions = await prepareQuizData(cardsForQuiz, topicForQuiz);
  
  uiElements.quizPreparationMessage.style.display = 'none';

  if (currentQuizQuestions.length === 0) {
    showAppErrorMessageCallback('Could not prepare any questions for the quiz. Try a different deck, ensure topic is set, or check console for errors.');
    uiElements.quizModeContainer.style.display = 'none';
    endQuiz(); // Revert to flashcard view
    return;
  }
  
  currentQuizQuestionIndex = 0;
  currentQuizScore = 0;
  displayQuizQuestion();
}

export function initQuiz(
    ai: GoogleGenAI,
    modelName: string,
    elements: QuizUIElements,
    getFlashcards: () => Flashcard[],
    getTopic: () => string,
    updateAppControls: () => void,
    displayAppFlashcards: (cards: Flashcard[]) => void,
    showAppError: (message: string) => void,
    getFlashcardsContainer: () => HTMLDivElement,
    getGenerationControls: () => HTMLDivElement,
    getMainTitle: () => HTMLHeadingElement,
    getMainDescription: () => HTMLParagraphElement
) {
    aiInstance = ai;
    geminiModelName = modelName;
    uiElements = elements;
    getAllFlashcardsCallback = getFlashcards;
    getCurrentTopicCallback = getTopic;
    updateAppControlsCallback = updateAppControls;
    displayAppFlashcardsCallback = displayAppFlashcards;
    showAppErrorMessageCallback = showAppError;
    getFlashcardsContainerCallback = getFlashcardsContainer;
    getGenerationControlsDivCallback = getGenerationControls;
    getMainTitleCallback = getMainTitle;
    getMainDescriptionCallback = getMainDescription;

    // Attach event listeners for quiz buttons
    uiElements.nextQuizQuestionButton.addEventListener('click', handleNextQuizQuestion);
    uiElements.finishQuizButton.addEventListener('click', endQuiz);
    uiElements.retryQuizButton.addEventListener('click', retryQuiz);
    uiElements.backToFlashcardsButton.addEventListener('click', endQuiz);
    
    console.log('[Quiz Module] Initialized.');
}

export function handleStartQuizClickExport() {
    handleStartQuizClickInternal();
}

export function getQuizIsActiveState(): boolean {
    return quizIsActive;
}
