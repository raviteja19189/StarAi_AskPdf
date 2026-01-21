import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';

// pdfjs-dist is globally available from the script tag in index.html
declare const pdfjsLib: any;

// Fix for Vite env typing
declare global {
  interface ImportMeta {
    env: {
      VITE_GEMINI_API_KEY: string;
      [key: string]: any;
    };
  }
}

interface PDF {
  id: string;
  name: string;
  text: string;
  uploadedAt: number;
}

interface ChatMessage {
  type: 'user' | 'model';
  text: string;
  citations?: string[];
  pdfIds?: string[];
}

const App: React.FC = () => {
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [activePdfId, setActivePdfId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string>('New Chat');

  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY as string });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('askpdf_data');
    if (savedData) {
      const data = JSON.parse(savedData);
      setPdfs(data.pdfs || []);
      setChatHistory(data.chatHistory || []);
      setSessionName(data.sessionName || 'New Chat');
      if (data.pdfs && data.pdfs.length > 0) {
        setActivePdfId(data.pdfs[0].id);
      }
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (pdfs.length > 0 || chatHistory.length > 0) {
      localStorage.setItem('askpdf_data', JSON.stringify({
        pdfs,
        chatHistory,
        sessionName,
      }));
    }
  }, [pdfs, chatHistory, sessionName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check both MIME type and file extension
    const isPdfByType = file.type === 'application/pdf';
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf');
    
    if (!isPdfByType && !isPdfByName) {
      setError('Please upload a valid PDF file.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async (e) => {
        const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n[Page ' + i + ']\n\n';
        }
        
        const newPdf: PDF = {
          id: Date.now().toString(),
          name: file.name,
          text: fullText,
          uploadedAt: Date.now(),
        };
        
        setPdfs((prev) => [...prev, newPdf]);
        setActivePdfId(newPdf.id);
        setChatHistory([]);
        
        // Update session name if it's the first PDF
        if (pdfs.length === 0) {
          setSessionName(file.name.replace('.pdf', ''));
        }
      };
    } catch (err) {
      console.error('Error processing PDF:', err);
      setError('Failed to read and process the PDF file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !activePdfId) return;

    const activePdf = pdfs.find((p) => p.id === activePdfId);
    if (!activePdf) return;

    const newUserMessage: ChatMessage = { type: 'user', text: userInput };
    setChatHistory((prev) => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
      const prompt = `Based strictly on the following document content, please answer the user's question. Include specific citations with page numbers where relevant. If the answer is not found in the document, say so.

      DOCUMENT: ${activePdf.name}
      ---
      ${activePdf.text}
      ---

      USER'S QUESTION:
      ${userInput}
      
      Please provide your answer with citations in the format: "...text... [p. X]" for page references.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const responseText = response.text;
      
      // Extract citations from response
      const citationMatches = responseText.match(/\[p\.\s*\d+\]/g) || [];
      const citations = [...new Set(citationMatches)];

      const modelResponse: ChatMessage = {
        type: 'model',
        text: responseText,
        citations: citations,
        pdfIds: [activePdfId],
      };
      setChatHistory((prev) => [...prev, modelResponse]);
    } catch (err) {
      console.error('Error generating content:', err);
      setError('Sorry, something went wrong while getting your answer.');
      setChatHistory((prev) => [...prev, {type: 'model', text: 'An error occurred. Please try again.'}]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const UserAvatar = () => (
    <div className="avatar user">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
    </div>
  );

  const ModelAvatar = () => (
    <div className="avatar model">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="12" width="16" height="8" rx="2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m17.5 7.5-1-1"/><path d="m6.5 7.5 1-1"/></svg>
    </div>
  );

  const renderContent = () => {
    if (isLoading && pdfs.length === 0) {
      return (
        <div className="main-content">
          <div className="spinner"></div>
          <p className="loading-text">Processing your PDF...</p>
        </div>
      );
    }

    if (pdfs.length === 0) {
      return (
        <div className="main-content">
          <div className="upload-section">
            <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <h2>Upload a PDF to Start Chatting</h2>
            <p>Ask questions and get answers based on its content.</p>
            <label htmlFor="file-upload" className="upload-label">
              Choose PDF File
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
            />
            {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
          </div>
        </div>
      );
    }

    const activePdf = pdfs.find((p) => p.id === activePdfId);

    return (
      <div className="chat-container">
        <div className="file-info">
          <div className="file-info-content">
            <p>
              Chatting with: <strong>{activePdf?.name || 'Unknown'}</strong>
            </p>
            <span className="pdf-count">({pdfs.length} PDF{pdfs.length !== 1 ? 's' : ''})</span>
          </div>
          {pdfs.length > 1 && (
            <div className="pdf-selector">
              <select 
                value={activePdfId || ''} 
                onChange={(e) => setActivePdfId(e.target.value)}
                className="pdf-dropdown"
              >
                {pdfs.map((pdf) => (
                  <option key={pdf.id} value={pdf.id}>
                    {pdf.name}
                  </option>
                ))}
              </select>
              <button 
                className="add-pdf-btn"
                onClick={() => document.getElementById('file-upload-multiple')?.click()}
                title="Add another PDF"
              >
                +
              </button>
              <input
                id="file-upload-multiple"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>
        <div className="chat-messages">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.type}`}>
               {msg.type === 'model' ? <ModelAvatar /> : <UserAvatar />}
               <div className={`message ${msg.type}`}>
                 {msg.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                 {msg.citations && msg.citations.length > 0 && (
                   <div className="citations">
                     <p className="citations-label">Citations: {msg.citations.join(', ')}</p>
                   </div>
                 )}
               </div>
            </div>
          ))}
          {isLoading && (
             <div className="message-wrapper model">
                <ModelAvatar />
                <div className="message model">
                    <div className="spinner" style={{width: '20px', height: '20px', borderLeftColor: 'var(--primary-color)'}}></div>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="message-input-area">
          <textarea
            ref={textareaRef}
            className="message-input"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the PDF..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()}
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>PDF Question & Answer AI</h1>
          <p className="session-name">{sessionName}</p>
        </div>
        {pdfs.length > 0 && (
          <button 
            className="new-chat-btn"
            onClick={() => {
              setPdfs([]);
              setActivePdfId(null);
              setChatHistory([]);
              setSessionName('New Chat');
              localStorage.removeItem('askpdf_data');
            }}
            title="Start a new chat session"
          >
            New Chat
          </button>
        )}
      </header>
      {renderContent()}
      {error && pdfs.length > 0 && (
        <div className="error-banner">{error}</div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(<App />);
