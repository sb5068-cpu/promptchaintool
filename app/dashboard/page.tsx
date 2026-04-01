"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Save } from 'lucide-react'

// --- Types based on your database schema ---
type Flavor = { id: number; slug: string; description: string }
type Step = { id: number; humor_flavor_id: number; order_by: number; llm_system_prompt: string; llm_user_prompt: string }

export default function Dashboard() {
  const supabase = createClient()
  const [flavors, setFlavors] = useState<Flavor[]>([])
  const [selectedFlavor, setSelectedFlavor] = useState<Flavor | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)

  // 1. Fetch Flavors on Load
  useEffect(() => {
    fetchFlavors()
  }, [])

  async function fetchFlavors() {
    const { data } = await supabase.from('humor_flavors').select('*').order('id', { ascending: false })
    if (data) setFlavors(data)
    setLoading(false)
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

  // 4. Create a new Step
    // 4. Create a new Step
      async function createStep() {
        if (!selectedFlavor) return
        const newOrder = steps.length > 0 ? steps[steps.length - 1].order_by + 1 : 1

        const { data, error } = await supabase.from('humor_flavor_steps').insert([{
          humor_flavor_id: selectedFlavor.id,
          order_by: newOrder,
          llm_system_prompt: "You are a funny assistant.",
          llm_user_prompt: "Make a joke about this image description: {description}",
          humor_flavor_step_type_id: 1,
          llm_input_type_id: 1,
          llm_output_type_id: 1,
          // 🚨 THIS IS THE NEW FIX: The AI model ID requirement!
          llm_model_id: 1
        }]).select().single()

        if (error) {
          console.error("SUPABASE ERROR:", error)
          alert(`Failed to add step! Check console. Error: ${error.message}`)
        }

        if (data) {
          setSteps([...steps, data])
        }
      }

  // 5. Update Step Text (Local State)
  function handleTextChange(index: number, field: 'llm_system_prompt' | 'llm_user_prompt', value: string) {
    const newSteps = [...steps]
    newSteps[index][field] = value
    setSteps(newSteps)
  }

  // 6. Save Step Text to Database (Fires when clicking outside the textbox)
  async function saveStepToDB(step: Step) {
    const { error } = await supabase.from('humor_flavor_steps').update({
      llm_system_prompt: step.llm_system_prompt,
      llm_user_prompt: step.llm_user_prompt
    }).eq('id', step.id)

    if (error) {
      alert("Failed to save changes to database!")
    }
  }

  // 7. Reorder Steps (Move Up/Down)
  async function moveStep(index: number, direction: 'up' | 'down') {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return

    const newSteps = [...steps]
    const swapIndex = direction === 'up' ? index - 1 : index + 1

    const tempOrder = newSteps[index].order_by
    newSteps[index].order_by = newSteps[swapIndex].order_by
    newSteps[swapIndex].order_by = tempOrder

    const tempStep = newSteps[index]
    newSteps[index] = newSteps[swapIndex]
    newSteps[swapIndex] = tempStep

    setSteps(newSteps)

    await supabase.from('humor_flavor_steps').upsert([
      { id: newSteps[index].id, order_by: newSteps[index].order_by },
      { id: newSteps[swapIndex].id, order_by: newSteps[swapIndex].order_by }
    ])
  }

  // 8. Delete Functions
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

  // 9. Test API Dummy Function
  function handleTestAPI() {
    if (steps.length === 0) {
      alert("Add some steps first!")
      return
    }

    // Log exactly what we will eventually send to your AI backend
    console.log("🚀 TESTING API WITH PAYLOAD:", steps)
    alert(`Success! Check your browser's Developer Console to see the ${steps.length} steps we captured. Next up: Wiring this to the real AI backend!`)
  }

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
            <div
              key={flavor.id}
              className={`p-4 border rounded cursor-pointer flex justify-between items-center transition-colors ${selectedFlavor?.id === flavor.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              onClick={() => handleSelectFlavor(flavor)}
            >
              <span className="font-medium">{flavor.slug}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteFlavor(flavor.id); }} className="text-red-500 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN: STEPS */}
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

                  {/* Sorting Controls */}
                  <div className="flex flex-col items-center justify-center gap-2 border-r pr-4">
                    <button onClick={() => moveStep(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                      <ArrowUp size={20} />
                    </button>
                    <span className="font-bold text-lg">{index + 1}</span>
                    <button onClick={() => moveStep(index, 'down')} disabled={index === steps.length - 1} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                      <ArrowDown size={20} />
                    </button>
                  </div>

                  {/* Step Content Area */}
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">SYSTEM PROMPT</label>
                      <textarea
                        value={step.llm_system_prompt}
                        onChange={(e) => handleTextChange(index, 'llm_system_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(step)}
                        className="w-full p-2 text-sm border rounded bg-transparent font-mono"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">USER PROMPT (Use {'{description}'} to inject image info)</label>
                      <textarea
                        value={step.llm_user_prompt}
                        onChange={(e) => handleTextChange(index, 'llm_user_prompt', e.target.value)}
                        onBlur={() => saveStepToDB(step)}
                        className="w-full p-2 text-sm border rounded bg-transparent font-mono"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Delete Step */}
                  <div className="flex items-start">
                    <button onClick={() => deleteStep(step.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
                      <Trash2 size={18} />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}