"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Save, Pencil, X } from 'lucide-react'

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

  // 1. Fetch everything on load
  useEffect(() => {
    fetchFlavors()
    fetchLookups()
  }, [])

  async function fetchFlavors() {
    const { data } = await supabase.from('humor_flavors').select('*').order('id', { ascending: false })
    if (data) setFlavors(data)
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

  // 3. Create a new Flavor
  async function createFlavor() {
    const slug = prompt("Enter a unique name (slug) for this flavor:")
    if (!slug) return
    const { data, error } = await supabase.from('humor_flavors').insert([{ slug, description: 'New Flavor' }]).select().single()
    if (!error && data) {
      setFlavors([data, ...flavors])
    } else {
      alert("Error creating flavor. Make sure the slug is unique!")
    }
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
    } else {
      alert("Error saving flavor. Make sure the slug is unique!")
    }
  }

  function cancelFlavorEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingFlavorId(null)
  }

  // 4. Create a new Step — use first real ID from each lookup table
  async function createStep() {
    if (!selectedFlavor) return
    const newOrder = steps.length > 0 ? steps[steps.length - 1].order_by + 1 : 1

    const { data, error } = await supabase.from('humor_flavor_steps').insert([{
      humor_flavor_id:         selectedFlavor.id,
      order_by:                newOrder,
      llm_system_prompt:       "You are a funny assistant.",
      llm_user_prompt:         "Make a joke about this image description: {description}",
      humor_flavor_step_type_id: stepTypes[0]?.id   ?? null,
      llm_input_type_id:         inputTypes[0]?.id  ?? null,
      llm_output_type_id:        outputTypes[0]?.id ?? null,
      llm_model_id:              llmModels[0]?.id   ?? null,
      llm_temperature:           0.8,
    }]).select().single()

    if (error) {
      console.error("SUPABASE ERROR:", error)
      alert(`Failed to add step! Error: ${error.message}`)
    }
    if (data) setSteps([...steps, data])
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
  }

  // 8. Delete
  async function deleteFlavor(id: number) {
    if (!confirm("Are you sure? This deletes all associated steps!")) return
    await supabase.from('humor_flavors').delete().eq('id', id)
    setFlavors(flavors.filter(f => f.id !== id))
    if (selectedFlavor?.id === id) setSelectedFlavor(null)
  }

  async function deleteStep(id: number) {
    await supabase.from('humor_flavor_steps').delete().eq('id', id)
    setSteps(steps.filter(s => s.id !== id))
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

      setTestStep('Step 4 / 4 — Generating captions (this may take a moment)…')
      const captionRes = await fetch(`${BASE}/pipeline/generate-captions`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ imageId, humorFlavorId: selectedFlavor.id }),
      })
      if (!captionRes.ok) throw new Error(await readErrorBody(captionRes, 'Caption generation failed'))
      const captions = await captionRes.json()

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

  if (loading) return <div>Loading interface...</div>

  return (
    <div className="flex gap-8 h-[80vh]">
      {/* LEFT COLUMN: FLAVORS */}
      <div className="w-1/3 bg-card p-6 rounded-xl border shadow-sm overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Humor Flavors</h2>
          <button onClick={createFlavor} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {flavors.map(flavor => (
            editingFlavorId === flavor.id ? (
              <div key={flavor.id} className="p-4 border rounded border-blue-500 bg-blue-50 dark:bg-blue-900/20 space-y-2">
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
                className={`p-4 border rounded cursor-pointer flex justify-between items-center transition-colors ${selectedFlavor?.id === flavor.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
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
                  <button onClick={(e) => { e.stopPropagation(); deleteFlavor(flavor.id) }} className="text-red-500 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          ))}
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

              {steps.map((step, index) => (
                <div key={step.id} className="p-4 border rounded-lg bg-background flex gap-4 shadow-sm">

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

                    {/* Prompts */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">SYSTEM PROMPT</label>
                      <textarea
                        value={step.llm_system_prompt}
                        onChange={(e) => handleStepChange(index, 'llm_system_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(steps[index])}
                        className="w-full p-2 text-sm border rounded bg-transparent font-mono"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">USER PROMPT (Use {'{description}'} to inject image info)</label>
                      <textarea
                        value={step.llm_user_prompt}
                        onChange={(e) => handleStepChange(index, 'llm_user_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(steps[index])}
                        className="w-full p-2 text-sm border rounded bg-transparent font-mono"
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
                          className="w-full p-1.5 text-sm border rounded bg-transparent"
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
                          className="w-full p-1.5 text-sm border rounded bg-transparent"
                        >
                          <option value="" disabled>Select type…</option>
                          {stepTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Input Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">INPUT TYPE</label>
                        <select
                          value={step.llm_input_type_id ?? ''}
                          onChange={e => handleStepChange(index, 'llm_input_type_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className="w-full p-1.5 text-sm border rounded bg-transparent"
                        >
                          <option value="" disabled>Select input…</option>
                          {inputTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Output Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">OUTPUT TYPE</label>
                        <select
                          value={step.llm_output_type_id ?? ''}
                          onChange={e => handleStepChange(index, 'llm_output_type_id', Number(e.target.value))}
                          onBlur={() => saveStepToDB(steps[index])}
                          className="w-full p-1.5 text-sm border rounded bg-transparent"
                        >
                          <option value="" disabled>Select output…</option>
                          {outputTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.slug ?? t.name ?? t.id}</option>
                          ))}
                        </select>
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
              ))}
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
