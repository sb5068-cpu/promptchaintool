"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Save, Pencil, X, Copy, Search, RotateCcw } from 'lucide-react'

const MY_FLAVORS_KEY = 'prompt-chain-tool:my-flavor-ids'

// --- Types ---
type Flavor    = { id: number; slug: string; description: string }
type Step      = {
  id: number
  humor_flavor_id: number
  order_by: number
  llm_system_prompt: string
  llm_user_prompt: string
  llm_model_id: number | null
  llm_input_type_id: number | null
  llm_output_type_id: number | null
  humor_flavor_step_type_id: number | null
  llm_temperature: number | null
}
type Caption   = { id: string; content: string }
type LookupRow = { id: number; name?: string; slug?: string; description?: string }

export default function Dashboard() {
  const supabase = createClient()

  const [flavors, setFlavors]               = useState<Flavor[]>([])
  const [selectedFlavor, setSelectedFlavor] = useState<Flavor | null>(null)
  const [steps, setSteps]                   = useState<Step[]>([])
  const [loading, setLoading]               = useState(true)

  // Lookup tables
  const [llmModels,    setLlmModels]    = useState<LookupRow[]>([])
  const [inputTypes,   setInputTypes]   = useState<LookupRow[]>([])
  const [outputTypes,  setOutputTypes]  = useState<LookupRow[]>([])
  const [stepTypes,    setStepTypes]    = useState<LookupRow[]>([])

  // Edit flavor state
  const [editingFlavorId,   setEditingFlavorId]   = useState<number | null>(null)
  const [editingFlavorData, setEditingFlavorData] = useState<{ slug: string; description: string }>({ slug: '', description: '' })

  // Test API panel state
  const [testPanelOpen, setTestPanelOpen] = useState(false)
  const [testImage,     setTestImage]     = useState<File | null>(null)
  const [testLoading,   setTestLoading]   = useState(false)
  const [testStep,      setTestStep]      = useState<string>('')
  const [testCaptions,  setTestCaptions]  = useState<Caption[]>([])
  const [testError,     setTestError]     = useState<string | null>(null)

  // Search & "mine" tracking (per-browser via localStorage)
  const [searchQuery, setSearchQuery] = useState('')
  const [myFlavorIds, setMyFlavorIds] = useState<Set<number>>(new Set())

  // Co-lum-bia template — loaded once, used for new flavors and the "reset" button
  const [columbiaSteps, setColumbiaSteps] = useState<Step[]>([])

  // 1. Fetch everything on load
  useEffect(() => {
    fetchFlavors()
    fetchLookups()
    try {
      const stored = localStorage.getItem(MY_FLAVORS_KEY)
      if (stored) {
        const ids = JSON.parse(stored)
        if (Array.isArray(ids)) setMyFlavorIds(new Set(ids))
      }
    } catch {}
  }, [])

  function markAsMine(id: number) {
    setMyFlavorIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(MY_FLAVORS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function unmarkAsMine(id: number) {
    setMyFlavorIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      try { localStorage.setItem(MY_FLAVORS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  async function fetchFlavors() {
    const { data } = await supabase.from('humor_flavors').select('*').order('id', { ascending: false })
    if (data) {
      setFlavors(data)
      const columbia = data.find(f => f.slug === 'co-lum-bia')
      if (columbia) {
        const { data: cSteps } = await supabase
          .from('humor_flavor_steps')
          .select('*')
          .eq('humor_flavor_id', columbia.id)
          .order('order_by', { ascending: true })
        if (cSteps) setColumbiaSteps(cSteps)
      }
    }
    setLoading(false)
  }

  async function fetchLookups() {
    const [models, inputs, outputs, types] = await Promise.all([
      supabase.from('llm_models').select('id, name').order('id'),
      supabase.from('llm_input_types').select('id, slug, description').order('id'),
      supabase.from('llm_output_types').select('id, slug, description').order('id'),
      supabase.from('humor_flavor_step_types').select('id, slug, description').order('id'),
    ])
    if (models.data)  setLlmModels(models.data)
    if (inputs.data)  setInputTypes(inputs.data)
    if (outputs.data) setOutputTypes(outputs.data)
    if (types.data)   setStepTypes(types.data)
  }

  // 2. Fetch Steps when a Flavor is clicked
  async function fetchSteps(flavorId: number) {
    const { data } = await supabase
      .from('humor_flavor_steps')
      .select('*')
      .eq('humor_flavor_id', flavorId)
      .order('order_by', { ascending: true })
    if (data) setSteps(data)
  }

  const handleSelectFlavor = (flavor: Flavor) => {
    setSelectedFlavor(flavor)
    fetchSteps(flavor.id)
    setTestPanelOpen(false)
    setTestCaptions([])
    setTestError(null)
  }

  // 3. Create a new Flavor — seeds steps from co-lum-bia as a working starting point
  async function createFlavor() {
    const promptText = columbiaSteps.length > 0
      ? "Enter a unique name (slug) for this flavor.\n\nSteps will be copied from co-lum-bia as a working starting point — edit the prompts to make it your own."
      : "Enter a unique name (slug) for this flavor:"
    const slug = prompt(promptText)
    if (!slug) return

    const description = columbiaSteps.length > 0 ? 'New Flavor (based on co-lum-bia)' : 'New Flavor'
    const { data, error } = await supabase.from('humor_flavors').insert([{ slug, description }]).select().single()
    if (error || !data) {
      alert("Error creating flavor. Make sure the slug is unique!")
      return
    }

    if (columbiaSteps.length > 0) {
      const stepsCopy = columbiaSteps.map(({ id, ...step }: Step) => ({
        ...step,
        humor_flavor_id: data.id,
      }))
      const { error: stepsError } = await supabase.from('humor_flavor_steps').insert(stepsCopy)
      if (stepsError) {
        console.error("Failed to seed steps from co-lum-bia:", stepsError)
        alert("Flavor created, but couldn't copy co-lum-bia's steps. You'll need to add steps manually.")
      }
    }

    setFlavors([data, ...flavors])
    markAsMine(data.id)
    handleSelectFlavor(data)
  }

  // 3b. Edit an existing Flavor
  function startEditingFlavor(e: React.MouseEvent, flavor: Flavor) {
    e.stopPropagation()
    setEditingFlavorId(flavor.id)
    setEditingFlavorData({ slug: flavor.slug, description: flavor.description })
  }

  async function saveFlavorEdit(id: number) {
    const { data, error } = await supabase
      .from('humor_flavors')
      .update({ slug: editingFlavorData.slug, description: editingFlavorData.description })
      .eq('id', id).select().single()
    if (!error && data) {
      setFlavors(flavors.map(f => f.id === id ? data : f))
      if (selectedFlavor?.id === id) setSelectedFlavor(data)
      setEditingFlavorId(null)
      markAsMine(id)
    } else {
      alert("Error saving flavor. Make sure the slug is unique!")
    }
  }

  function cancelFlavorEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingFlavorId(null)
  }

  // 3c. Duplicate a Flavor and all its steps
  async function duplicateFlavor(e: React.MouseEvent, flavor: Flavor) {
    e.stopPropagation()
    const newSlug = prompt("Enter a unique name for the duplicate:", `${flavor.slug}-copy`)
    if (!newSlug) return

    const { data: newFlavor, error: flavorError } = await supabase
      .from('humor_flavors')
      .insert([{ slug: newSlug, description: flavor.description }])
      .select().single()

    if (flavorError || !newFlavor) {
      alert("Error creating duplicate. Make sure the name is unique!")
      return
    }

    const { data: originalSteps } = await supabase
      .from('humor_flavor_steps')
      .select('*')
      .eq('humor_flavor_id', flavor.id)
      .order('order_by', { ascending: true })

    if (originalSteps && originalSteps.length > 0) {
      const stepsCopy = originalSteps.map(({ id, ...step }: Step) => ({
        ...step,
        humor_flavor_id: newFlavor.id,
      }))
      await supabase.from('humor_flavor_steps').insert(stepsCopy)
    }

    setFlavors([newFlavor, ...flavors])
    markAsMine(newFlavor.id)
  }

  // 4. Create a new Step — inherits from the last step (or co-lum-bia's first) so the working config propagates
  async function createStep() {
    if (!selectedFlavor) return
    const newOrder = steps.length > 0 ? steps[steps.length - 1].order_by + 1 : 1
    const template = steps[steps.length - 1] ?? columbiaSteps[0] ?? null

    const newStep = template ? {
      humor_flavor_id:           selectedFlavor.id,
      order_by:                  newOrder,
      llm_system_prompt:         template.llm_system_prompt,
      llm_user_prompt:           template.llm_user_prompt,
      humor_flavor_step_type_id: template.humor_flavor_step_type_id,
      llm_input_type_id:         template.llm_input_type_id,
      llm_output_type_id:        template.llm_output_type_id,
      llm_model_id:              template.llm_model_id,
      llm_temperature:           template.llm_temperature,
    } : {
      humor_flavor_id:           selectedFlavor.id,
      order_by:                  newOrder,
      llm_system_prompt:         "You are a funny assistant.",
      llm_user_prompt:           "Make a joke about this image description: {description}",
      humor_flavor_step_type_id: stepTypes[0]?.id   ?? null,
      llm_input_type_id:         inputTypes[0]?.id  ?? null,
      llm_output_type_id:        outputTypes[0]?.id ?? null,
      llm_model_id:              llmModels[0]?.id   ?? null,
      llm_temperature:           0.8,
    }

    const { data, error } = await supabase.from('humor_flavor_steps').insert([newStep]).select().single()

    if (error) {
      console.error("SUPABASE ERROR:", error)
      alert(`Failed to add step! Error: ${error.message}`)
    }
    if (data) {
      setSteps([...steps, data])
      markAsMine(selectedFlavor.id)
    }
  }

  // 5. Update Step field in local state
  function handleStepChange(index: number, field: keyof Step, value: string | number | null) {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setSteps(newSteps)
  }

  // 6. Save Step to DB (on blur)
  async function saveStepToDB(step: Step) {
    const { error } = await supabase.from('humor_flavor_steps').update({
      llm_system_prompt:         step.llm_system_prompt,
      llm_user_prompt:           step.llm_user_prompt,
      llm_model_id:              step.llm_model_id,
      llm_input_type_id:         step.llm_input_type_id,
      llm_output_type_id:        step.llm_output_type_id,
      humor_flavor_step_type_id: step.humor_flavor_step_type_id,
      llm_temperature:           step.llm_temperature,
    }).eq('id', step.id)
    if (error) alert("Failed to save changes to database!")
    else if (selectedFlavor) markAsMine(selectedFlavor.id)
  }

  // 7. Reorder Steps
  async function moveStep(index: number, direction: 'up' | 'down') {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return
    const newSteps  = [...steps]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const tempOrder = newSteps[index].order_by
    newSteps[index].order_by       = newSteps[swapIndex].order_by
    newSteps[swapIndex].order_by   = tempOrder
    const tempStep                 = newSteps[index]
    newSteps[index]                = newSteps[swapIndex]
    newSteps[swapIndex]            = tempStep
    setSteps(newSteps)
    await supabase.from('humor_flavor_steps').upsert([
      { id: newSteps[index].id,    order_by: newSteps[index].order_by },
      { id: newSteps[swapIndex].id, order_by: newSteps[swapIndex].order_by },
    ])
    if (selectedFlavor) markAsMine(selectedFlavor.id)
  }

  // 8. Delete
  async function deleteFlavor(id: number) {
    if (!confirm("Are you sure? This deletes all associated steps!")) return
    await supabase.from('humor_flavors').delete().eq('id', id)
    setFlavors(flavors.filter(f => f.id !== id))
    unmarkAsMine(id)
    if (selectedFlavor?.id === id) setSelectedFlavor(null)
  }

  async function deleteStep(id: number) {
    await supabase.from('humor_flavor_steps').delete().eq('id', id)
    setSteps(steps.filter(s => s.id !== id))
    if (selectedFlavor) markAsMine(selectedFlavor.id)
  }

  // Reset a step to the corresponding co-lum-bia template (matched by index, clamped to last)
  async function resetStepToColumbia(index: number) {
    const template = columbiaSteps[index] ?? columbiaSteps[columbiaSteps.length - 1]
    if (!template) {
      alert("co-lum-bia template isn't loaded — can't reset.")
      return
    }
    const current = steps[index]
    if (!confirm(`Reset step ${index + 1} to co-lum-bia's defaults? This will overwrite the prompts and settings on this step.`)) return

    const updated: Step = {
      ...current,
      llm_system_prompt:         template.llm_system_prompt,
      llm_user_prompt:           template.llm_user_prompt,
      humor_flavor_step_type_id: template.humor_flavor_step_type_id,
      llm_input_type_id:         template.llm_input_type_id,
      llm_output_type_id:        template.llm_output_type_id,
      llm_model_id:              template.llm_model_id,
      llm_temperature:           template.llm_temperature,
    }
    const newSteps = [...steps]
    newSteps[index] = updated
    setSteps(newSteps)
    await saveStepToDB(updated)
  }

  // Per-step validation — what's missing that would cause the API to fail
  function validateStep(step: Step): { valid: boolean; missing: string[] } {
    const missing: string[] = []
    if (!step.llm_model_id)              missing.push('Model')
    if (!step.humor_flavor_step_type_id) missing.push('Step Type')
    if (!step.llm_input_type_id)         missing.push('Input Type')
    if (!step.llm_output_type_id)        missing.push('Output Type')
    if (!step.llm_system_prompt?.trim()) missing.push('System Prompt')
    if (!step.llm_user_prompt?.trim())   missing.push('User Prompt')
    return { valid: missing.length === 0, missing }
  }

  // 9. Test API
  function handleTestAPI() {
    if (steps.length === 0) { alert("Add some steps first!"); return }
    setTestPanelOpen(true)
    setTestCaptions([])
    setTestError(null)
    setTestStep('')
  }

  async function readErrorBody(res: Response, label: string): Promise<string> {
    try {
      const body = await res.json()
      const detail = body?.error ?? body?.message ?? body?.detail ?? JSON.stringify(body)
      return `${label} (${res.status}): ${detail}`
    } catch {
      return `${label}: ${res.status} ${res.statusText}`
    }
  }

  async function runCaptionPipeline() {
    if (!testImage || !selectedFlavor) return

    // Pre-flight: warn about any steps with missing required IDs
    const badSteps = steps.filter(
      s => !s.llm_model_id || !s.llm_input_type_id || !s.llm_output_type_id || !s.humor_flavor_step_type_id
    )
    if (badSteps.length > 0) {
      const nums = badSteps.map(s => s.order_by).join(', ')
      const go = confirm(
        `⚠️ Step(s) ${nums} have missing Model / Input Type / Output Type / Step Type.\n\nThis is likely causing the 500 error. Fix the dropdowns and try again.\n\nContinue anyway?`
      )
      if (!go) return
    }

    setTestLoading(true)
    setTestError(null)
    setTestCaptions([])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated. Please log in again.")

      const BASE = 'https://api.almostcrackd.ai'
      const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

      setTestStep('Step 1 / 4 — Generating upload URL…')
      const presignRes = await fetch(`${BASE}/pipeline/generate-presigned-url`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ contentType: testImage.type }),
      })
      if (!presignRes.ok) throw new Error(await readErrorBody(presignRes, 'Presign failed'))
      const { presignedUrl, cdnUrl } = await presignRes.json()

      setTestStep('Step 2 / 4 — Uploading image…')
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT', headers: { 'Content-Type': testImage.type }, body: testImage,
      })
      if (!uploadRes.ok) throw new Error(`Upload to S3 failed: ${uploadRes.status} ${uploadRes.statusText}`)

      setTestStep('Step 3 / 4 — Registering image…')
      const registerRes = await fetch(`${BASE}/pipeline/upload-image-from-url`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
      })
      if (!registerRes.ok) throw new Error(await readErrorBody(registerRes, 'Register failed'))
      const { imageId } = await registerRes.json()

      // Log the exact payload so you can inspect it in DevTools
      const captionPayload = { imageId, humorFlavorId: selectedFlavor.id }
      console.log('📤 generate-captions payload:', captionPayload)
      console.log('📋 steps being used:', steps.map(s => ({
        id: s.id,
        order_by: s.order_by,
        llm_model_id: s.llm_model_id,
        llm_input_type_id: s.llm_input_type_id,
        llm_output_type_id: s.llm_output_type_id,
        humor_flavor_step_type_id: s.humor_flavor_step_type_id,
        llm_temperature: s.llm_temperature,
      })))

      setTestStep('Step 4 / 4 — Generating captions (this may take a moment)…')
      const captionRes = await fetch(`${BASE}/pipeline/generate-captions`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify(captionPayload),
      })

      // Log the raw response for debugging
      const rawText = await captionRes.text()
      console.log(`📥 generate-captions response (${captionRes.status}):`, rawText)

      if (!captionRes.ok) {
        let detail = rawText
        try { const j = JSON.parse(rawText); detail = j?.error ?? j?.message ?? j?.detail ?? rawText } catch { /* keep rawText */ }
        throw new Error(`Caption generation failed (${captionRes.status}): ${detail}`)
      }

      const captions = JSON.parse(rawText)
      setTestCaptions(Array.isArray(captions) ? captions : [])
      setTestStep('Done!')
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'An unknown error occurred.')
      setTestStep('')
    } finally {
      setTestLoading(false)
    }
  }

  // Helpers for select labels
  const labelFor = (rows: LookupRow[], id: number | null) =>
    rows.find(r => r.id === id)?.name ?? rows.find(r => r.id === id)?.slug ?? String(id)

  const filteredFlavors = flavors.filter(f => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return f.slug.toLowerCase().includes(q) || (f.description?.toLowerCase().includes(q) ?? false)
  })

  if (loading) return <div>Loading interface...</div>

  return (
    <div className="flex gap-8 h-[80vh]">
      {/* LEFT COLUMN: FLAVORS */}
      <div className="w-1/3 bg-card p-6 rounded-xl border shadow-sm overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Humor Flavors</h2>
          <button onClick={createFlavor} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus size={20} />
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search flavors…"
            className="w-full pl-8 pr-7 py-1.5 text-sm border rounded bg-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" />
          <span>= flavors you created or modified</span>
        </div>

        <div className="space-y-3">
          {filteredFlavors.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              {searchQuery ? `No flavors match "${searchQuery}".` : 'No flavors yet.'}
            </p>
          )}
          {filteredFlavors.map(flavor => {
            const isMine = myFlavorIds.has(flavor.id)
            const mineAccent = isMine ? 'border-l-4 border-l-amber-500' : ''
            return editingFlavorId === flavor.id ? (
              <div key={flavor.id} className={`p-4 border rounded border-blue-500 bg-blue-50 dark:bg-blue-900/20 space-y-2 ${mineAccent}`}>
                <input
                  value={editingFlavorData.slug}
                  onChange={e => setEditingFlavorData(d => ({ ...d, slug: e.target.value }))}
                  className="w-full p-1 text-sm border rounded bg-transparent font-mono"
                  placeholder="Slug"
                />
                <input
                  value={editingFlavorData.description}
                  onChange={e => setEditingFlavorData(d => ({ ...d, description: e.target.value }))}
                  className="w-full p-1 text-sm border rounded bg-transparent"
                  placeholder="Description"
                />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => saveFlavorEdit(flavor.id)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Save size={12} /> Save
                  </button>
                  <button onClick={cancelFlavorEdit} className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X size={12} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={flavor.id}
                className={`p-4 border rounded cursor-pointer flex justify-between items-center transition-colors ${selectedFlavor?.id === flavor.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} ${mineAccent}`}
                onClick={() => handleSelectFlavor(flavor)}
              >
                <div className="min-w-0">
                  <span className="font-medium block truncate">{flavor.slug}</span>
                  {flavor.description && <span className="text-xs text-gray-500 block truncate">{flavor.description}</span>}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button onClick={(e) => startEditingFlavor(e, flavor)} className="text-gray-400 p-1 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => duplicateFlavor(e, flavor)} className="text-gray-400 p-1 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Duplicate flavor">
                    <Copy size={14} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteFlavor(flavor.id) }} className="text-red-500 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="w-2/3 bg-card p-6 rounded-xl border shadow-sm overflow-y-auto">
        {!selectedFlavor ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a flavor to edit its prompt chain steps.
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Steps for: {selectedFlavor.slug}</h2>
              <div className="space-x-2 flex">
                <button onClick={createStep} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2">
                  <Plus size={16} /> Add Step
                </button>
                <button onClick={handleTestAPI} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2">
                  <Play size={16} /> Test API
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {steps.length === 0 && <p className="text-gray-500">No steps created yet.</p>}

              {steps.map((step, index) => {
                const v = validateStep(step)
                return (
                <div key={step.id} className={`p-4 border rounded-lg bg-background flex gap-4 shadow-sm ${v.valid ? '' : 'border-amber-300 dark:border-amber-700'}`}>

                  {/* Reorder */}
                  <div className="flex flex-col items-center justify-center gap-2 border-r pr-4">
                    <button onClick={() => moveStep(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                      <ArrowUp size={20} />
                    </button>
                    <span className="font-bold text-lg">{index + 1}</span>
                    <button onClick={() => moveStep(index, 'down')} disabled={index === steps.length - 1} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                      <ArrowDown size={20} />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3">

                    {/* Status header: validation badge + reset-to-defaults */}
                    <div className="flex items-center justify-between gap-2">
                      {v.valid ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">
                          ✓ Ready
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                          ⚠ Missing: {v.missing.join(', ')}
                        </span>
                      )}
                      {columbiaSteps.length > 0 && (
                        <button
                          onClick={() => resetStepToColumbia(index)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                          title="Restore this step's settings from co-lum-bia"
                        >
                          <RotateCcw size={12} />
                          Reset to co-lum-bia defaults
                        </button>
                      )}
                    </div>

                    {/* Prompts */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">SYSTEM PROMPT</label>
                      <textarea
                        value={step.llm_system_prompt}
                        onChange={(e) => handleStepChange(index, 'llm_system_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(steps[index])}
                        className={`w-full p-2 text-sm border rounded bg-transparent font-mono ${!step.llm_system_prompt?.trim() ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">USER PROMPT (Use {'{description}'} to inject image info)</label>
                      <textarea
                        value={step.llm_user_prompt}
                        onChange={(e) => handleStepChange(index, 'llm_user_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(steps[index])}
                        className={`w-full p-2 text-sm border rounded bg-transparent font-mono ${!step.llm_user_prompt?.trim() ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        rows={2}
                      />
                    </div>

                    {/* Lookup selects */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Model */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">MODEL</label>
                        <select
                          value={step.llm_model_id ?? ''}
                          onChange={e => handleStepChange(index, 'llm_model_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className={`w-full p-1.5 text-sm border rounded bg-transparent ${!step.llm_model_id ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        >
                          <option value="" disabled>Select model…</option>
                          {llmModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name ?? m.slug ?? m.id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Temperature */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                          TEMPERATURE ({step.llm_temperature ?? 0.8})
                        </label>
                        <input
                          type="range" min="0" max="2" step="0.1"
                          value={step.llm_temperature ?? 0.8}
                          onChange={e => handleStepChange(index, 'llm_temperature', parseFloat(e.target.value))}
                          onMouseUp={() => saveStepToDB(steps[index])}
                          onTouchEnd={() => saveStepToDB(steps[index])}
                          className="w-full"
                        />
                      </div>

                      {/* Step Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">STEP TYPE</label>
                        <select
                          value={step.humor_flavor_step_type_id ?? ''}
                          onChange={e => handleStepChange(index, 'humor_flavor_step_type_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className={`w-full p-1.5 text-sm border rounded bg-transparent ${!step.humor_flavor_step_type_id ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        >
                          <option value="" disabled>Select type…</option>
                          {stepTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
                        {stepTypes.find(t => t.id === step.humor_flavor_step_type_id)?.description && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            {stepTypes.find(t => t.id === step.humor_flavor_step_type_id)?.description}
                          </p>
                        )}
                      </div>

                      {/* Input Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">INPUT TYPE</label>
                        <select
                          value={step.llm_input_type_id ?? ''}
                          onChange={e => handleStepChange(index, 'llm_input_type_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className={`w-full p-1.5 text-sm border rounded bg-transparent ${!step.llm_input_type_id ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        >
                          <option value="" disabled>Select input…</option>
                          {inputTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
                        {inputTypes.find(t => t.id === step.llm_input_type_id)?.description && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            {inputTypes.find(t => t.id === step.llm_input_type_id)?.description}
                          </p>
                        )}
                      </div>

                      {/* Output Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">OUTPUT TYPE</label>
                        <select
                          value={step.llm_output_type_id ?? ''}
                          onChange={e => handleStepChange(index, 'llm_output_type_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className={`w-full p-1.5 text-sm border rounded bg-transparent ${!step.llm_output_type_id ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        >
                          <option value="" disabled>Select output…</option>
                          {outputTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
                        {outputTypes.find(t => t.id === step.llm_output_type_id)?.description && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            {outputTypes.find(t => t.id === step.llm_output_type_id)?.description}
                          </p>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Delete */}
                  <div className="flex items-start">
                    <button onClick={() => deleteStep(step.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
                      <Trash2 size={18} />
                    </button>
                  </div>

                </div>
                )
              })}
            </div>

            {/* Test API Panel */}
            {testPanelOpen && (
              <div className="mt-6 p-5 border rounded-xl bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg">Test Caption Pipeline</h3>
                  <button onClick={() => { setTestPanelOpen(false); setTestCaptions([]); setTestError(null); setTestStep('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Select a test image:</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                      onChange={e => { setTestImage(e.target.files?.[0] ?? null); setTestCaptions([]); setTestError(null); setTestStep('') }}
                      className="text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 dark:file:bg-purple-900 dark:file:text-purple-200"
                    />
                    {testImage && <p className="text-xs text-gray-500 mt-1">{testImage.name} — {(testImage.size / 1024).toFixed(1)} KB</p>}
                  </div>

                  <button
                    onClick={runCaptionPipeline}
                    disabled={!testImage || testLoading}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                  >
                    <Play size={15} />
                    {testLoading ? 'Running pipeline…' : `Generate Captions for "${selectedFlavor.slug}"`}
                  </button>

                  {testStep && <p className="text-sm text-purple-700 dark:text-purple-300 font-medium animate-pulse">{testStep}</p>}

                  {testError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
                      <strong>Error:</strong> {testError}
                    </div>
                  )}

                  {testCaptions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 text-sm">Generated {testCaptions.length} caption{testCaptions.length !== 1 ? 's' : ''}:</h4>
                      <ul className="space-y-2">
                        {testCaptions.map((caption, i) => (
                          <li key={caption.id ?? i} className="p-3 bg-white dark:bg-gray-900 border rounded-lg text-sm shadow-sm">
                            <span className="font-mono text-xs text-gray-400 mr-2">#{i + 1}</span>
                            {caption.content}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
