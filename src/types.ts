export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  videoUrl?: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  chats: Chat[];
  currentChatId: string | null;
  sidebarExpanded: boolean;
  loading: boolean;
  error: string | null;
}
