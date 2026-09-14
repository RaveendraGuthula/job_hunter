export class DuplicateProtector {
  private readonly processedMessages = new Set<string>();
  private readonly submittedQuestions = new Set<string>();

  hasProcessedMessage(fingerprint: string): boolean {
    return this.processedMessages.has(fingerprint);
  }

  markMessageProcessed(fingerprint: string): void {
    this.processedMessages.add(fingerprint);
  }

  hasSubmittedQuestion(fingerprint: string): boolean {
    return this.submittedQuestions.has(fingerprint);
  }

  markQuestionSubmitted(fingerprint: string): void {
    this.submittedQuestions.add(fingerprint);
  }

  reset(): void {
    this.processedMessages.clear();
    this.submittedQuestions.clear();
  }
}