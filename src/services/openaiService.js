// ═══════════════════════════════════════════════════════════════════════
// AI / OpenAI Integration — COMMENTED OUT per user request
// Uncomment and configure VITE_OPENAI_API_KEY when ready to enable AI features
// ═══════════════════════════════════════════════════════════════════════

/*
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  dangerouslyAllowBrowser: true,
})

export const processLeadData = async (formData) => {
  try {
    const prompt = `You are a CRM lead processing AI. Analyze the following lead information and generate a comprehensive lead profile.

Input Data:
- Company Name: ${formData.companyName || 'N/A'}
- Industry: ${formData.industry || 'N/A'}
- Contact Person: ${formData.contactName || 'N/A'}
- Email: ${formData.email || 'N/A'}
- Phone: ${formData.phone || 'N/A'}
- Website: ${formData.website || 'N/A'}
- Company Size: ${formData.companySize || 'N/A'}
- Location: ${formData.location || 'N/A'}
- Additional Notes: ${formData.notes || 'N/A'}

Please provide a JSON response with:
{
  "leadScore": <number 0-100>,
  "priority": "<high|medium|low>",
  "summary": "<brief summary>",
  "recommendedActions": ["<action1>", "<action2>", "<action3>"],
  "estimatedValue": "<estimated deal value>",
  "nextSteps": "<recommended next steps>",
  "tags": ["<tag1>", "<tag2>"]
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an expert CRM lead analyst. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const responseText = completion.choices[0]?.message?.content || '{}'
    let aiAnalysis = {}
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0])
    } catch (e) {
      aiAnalysis = {
        leadScore: 65,
        priority: 'medium',
        summary: 'Lead processed successfully',
        recommendedActions: ['Follow up via email', 'Schedule a call', 'Send company information'],
        estimatedValue: 'To be determined',
        nextSteps: 'Initial contact and qualification',
        tags: ['new', 'qualified'],
      }
    }

    return { ...formData, aiAnalysis, processedAt: new Date().toISOString() }
  } catch (error) {
    console.error('Error processing lead with OpenAI:', error)
    return {
      ...formData,
      aiAnalysis: {
        leadScore: 50,
        priority: 'medium',
        summary: 'Lead data collected. AI processing unavailable.',
        recommendedActions: ['Follow up via email', 'Qualify the lead'],
        estimatedValue: 'To be determined',
        nextSteps: 'Initial contact required',
        tags: ['new', 'pending'],
      },
      processedAt: new Date().toISOString(),
    }
  }
}

export const generateLeadSuggestions = async (industry) => {
  try {
    const prompt = `Generate 3 realistic lead suggestions for the ${industry} industry.
    Return a JSON array with objects containing: companyName, contactName, email, phone, website, location, companySize, and notes.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Return only valid JSON array, no additional text.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 800,
    })

    const responseText = completion.choices[0]?.message?.content || '[]'
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch (error) {
    console.error('Error generating lead suggestions:', error)
    return []
  }
}
*/
