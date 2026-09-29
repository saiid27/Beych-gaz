import { supabase } from './supabaseClient'

export async function fetchMyConversations(userId) {
  const { data: memberships, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)

  if (error) throw error
  const ids = memberships.map((m) => m.conversation_id)
  if (ids.length === 0) return []

  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*, conversation_participants(user_id, profiles(id, username, avatar_url))')
    .in('id', ids)
    .order('created_at', { ascending: false })

  if (convError) throw convError
  return conversations
}

export async function findDirectConversation(userIdA, userIdB) {
  const { data: mine, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations!inner(is_group)')
    .eq('user_id', userIdA)
    .eq('conversations.is_group', false)

  if (error) throw error

  for (const row of mine) {
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', row.conversation_id)

    const memberIds = participants.map((p) => p.user_id).sort()
    if (memberIds.length === 2 && memberIds.includes(userIdB)) {
      return row.conversation_id
    }
  }
  return null
}

export async function createConversation({ createdBy, memberIds, isGroup, name }) {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ created_by: createdBy, is_group: isGroup, name: isGroup ? name : null })
    .select()
    .single()

  if (error) throw error

  const rows = [createdBy, ...memberIds].map((userId) => ({
    conversation_id: conversation.id,
    user_id: userId,
  }))

  const { error: partError } = await supabase.from('conversation_participants').insert(rows)
  if (partError) throw partError

  return conversation
}

export async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles(username, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export async function sendMessage({ conversationId, senderId, content, imageUrl }) {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content: content || null,
    image_url: imageUrl || null,
  })
  if (error) throw error
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file

  const image = new Image()
  const imageUrl = URL.createObjectURL(file)

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })

    const scale = Math.min(1, Math.sqrt(0.1), 900 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.72)
    })

    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function uploadChatImage(file, userId) {
  const compressedFile = await compressImage(file)
  const ext = compressedFile.name.split('.').pop()
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('chat-images').upload(path, compressedFile)
  if (error) throw error
  const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
  return data.publicUrl
}

export async function searchProfiles(query, excludeUserId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .neq('id', excludeUserId)
    .ilike('username', `%${query}%`)
    .limit(20)

  if (error) throw error
  return data
}
