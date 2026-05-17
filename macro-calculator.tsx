"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedMealPhoto } from "./app/api/identify-meal/route";
import { ApplyRecipeDialog } from "./components/macro/ApplyRecipeDialog";
import { ApplyTemplateDialog } from "./components/macro/ApplyTemplateDialog";
import { CameraSheet } from "./components/macro/CameraSheet";
import { CustomFoodForm } from "./components/macro/CustomFoodForm";
import MacroResults from "./components/macro/MacroResults";
import { MealPhotoReviewDialog } from "./components/macro/MealPhotoReviewDialog";
import MealPlanner from "./components/macro/MealPlanner";
import { MyFoodsView } from "./components/macro/MyFoodsView";
import { PairPhoneDialog } from "./components/macro/PairPhoneDialog";
import PersonalInfoForm from "./components/macro/PersonalInfoForm";
import { ProgressView } from "./components/macro/ProgressView";
import { RecipesView } from "./components/macro/RecipesView";
import { SaveTemplateDialog } from "./components/macro/SaveTemplateDialog";
import { SettingsView } from "./components/macro/SettingsView";
import { TemplatesView } from "./components/macro/TemplatesView";
import {
  CalculatedValues,
  Food,
  FoodItem,
  type MacroSplit,
  Meal,
  PersonalInfo,
  type Recipe,
  TotalMacros,
} from "./components/macro/types";
import { AppShell } from "./components/shell/AppShell";
import type { ViewKey } from "./components/shell/Sidebar";
import { foodDatabase } from "./data/food-database";
import { useDailyLog } from "./hooks/use-daily-log";
import { useFoodSearch } from "./hooks/use-food-search";
import { useIsMobile } from "./hooks/use-mobile";
import { useProfile } from "./hooks/use-profile";
import { useToday } from "./hooks/use-today";
import { useUser } from "./hooks/use-user";
import { requestAiMealPlan } from "./lib/ai-plan";
import type { CoherenceIssue } from "./lib/ai/plan-coherence";
import {
  addCustomFood,
  customToFood,
  listCustomFoods,
  type MealTemplate,
} from "./lib/db";
import { aggregateMacroBreakdown, computeMacros } from "./lib/macros";
import { planDay, summarisePlan } from "./lib/meal-planner";
import { bumpPending } from "./lib/sync-status";

const DEFAULT_PROFILE: PersonalInfo = {
  displayName: null,
  gender: "male",
  age: 30,
  weight: 70,
  height: 175,
  activityLevel: "moderate",
  goal: "maintain",
  dietType: "balanced",
  dietPreference: "omnivore",
  cuisinePreferences: [],
  allergies: [],
  dislikedFoods: [],
  weeklyRateKg: 0.5,
  manualTdee: null,
  macroSplit: null,
};

const DEFAULT_MEALS: Meal[] = [
  { id: 1, name: "Breakfast", foods: [] },
  { id: 2, name: "Lunch", foods: [] },
  { id: 3, name: "Dinner", foods: [] },
  { id: 4, name: "Snacks", foods: [] },
];

/** Convert a Blob to a bare base64 string (no data: prefix), as
 *  /api/identify-meal expects. Shared by the in-sheet photo flow and
 *  the paired-phone photo flow. FileReader is the most compatible
 *  cross-browser path. */
/** Render a short trailing note for the status banner when the AI plan
 *  came back with coherence warnings the agent loop couldn't fix.
 *  Empty string means "no warnings" — the banner stays clean. */
function formatCoherenceNote(issues: CoherenceIssue[] | undefined): string {
  if (!issues || issues.length === 0) return "";
  const head = issues.slice(0, 3);
  const bullets = head.map((i) => `• ${i.message}`).join("\n");
  const extra =
    issues.length > head.length
      ? `\n• …and ${issues.length - head.length} more`
      : "";
  return `\nSome issues remain:\n${bullets}${extra}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read blob."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

const MacroCalculator = () => {
  // Persisted profile. Defaults are used until the IndexedDB hydration
  // completes (a few ms after mount).
  const { profile: personalInfo, setProfile: setPersonalInfo } =
    useProfile(DEFAULT_PROFILE);

  // Currently displayed day. `null` means "follow today" — useful so the
  // log live-updates across midnight when the user isn't pinned to a
  // specific historical date.
  const today = useToday();
  const [explicitDate, setExplicitDate] = useState<string | null>(null);
  const selectedDate = explicitDate ?? today;

  const { meals, setMeals } = useDailyLog(selectedDate, DEFAULT_MEALS);

  // State for new food being added
  const [newFood, setNewFood] = useState<FoodItem>({
    id: 0,
    name: "",
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    portionSize: 0,
    selectedMealId: 1,
  });

  // State for meal plan generation
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
  const [mealPlanMessage, setMealPlanMessage] = useState("");

  // State for editing food portions
  const [editingFood, setEditingFood] = useState<{
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    originalFood: FoodItem | null;
  }>({ mealId: null, foodId: null, portionSize: 0, originalFood: null });

  // State for replacing food
  const [replacingFood, setReplacingFood] = useState<{
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    searchTerm: string;
    suggestions: Food[];
    showSuggestions: boolean;
  }>({
    mealId: null,
    foodId: null,
    portionSize: 0,
    searchTerm: "",
    suggestions: [],
    showSuggestions: false,
  });

  // State for food search and suggestions
  const [foodSearch, setFoodSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Per-100g reference for the last-picked food. Drives portion recalculation
  // across all three sources (builtin / custom / OFF) without re-querying.
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  // Bump to force the search hook to re-query custom foods after a save.
  const [customFoodsRev, setCustomFoodsRev] = useState(0);
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  // Camera/barcode entry-point dialog. Opens from AddFoodForm's
  // "Camera" button. Barcode path: resolved Food flows back through
  // `handleFoodSelect` like a typed-search pick. Photo path: AI
  // returns a multi-food list → `MealPhotoReviewDialog` opens for
  // review + bulk-add.
  const [cameraSheetOpen, setCameraSheetOpen] = useState(false);
  const [mealPhotoResult, setMealPhotoResult] =
    useState<ResolvedMealPhoto | null>(null);
  // Phone pairing flow. Only offered on desktop (mobile has the camera
  // right there). Opens from a footer link inside CameraSheet. Errors
  // during paired-capture processing surface via `mealPlanMessage` so
  // they share the topbar status channel rather than carrying a third
  // error-state pipeline.
  const [pairPhoneOpen, setPairPhoneOpen] = useState(false);
  const isMobile = useIsMobile();
  // AI route is auth-gated; surface the Photo tab only when signed in.
  // The Anthropic env gate runs server-side — clicking with a stale
  // session surfaces a clear 503 error in the sheet's error state.
  const { user } = useUser();
  // Meal templates: which dialog is open and for which meal. `null` =
  // no dialog. The dialogs themselves read templates from IDB on open.
  const [templateDialog, setTemplateDialog] = useState<
    { kind: "save"; mealId: number } | { kind: "apply"; mealId: number } | null
  >(null);
  // Apply-recipe dialog: which meal slot the user wants to apply a recipe
  // into. `null` = closed.
  const [applyRecipeMealId, setApplyRecipeMealId] = useState<number | null>(
    null,
  );
  const [view, setView] = useState<ViewKey>("calculator");

  const search = useFoodSearch(foodSearch, customFoodsRev);
  const foodSuggestions = search.results;

  // State for portion size
  const [portionSize, setPortionSize] = useState(100); // Default 100g

  // Refs for dropdowns
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const replacementSuggestionsRef = useRef<HTMLDivElement | null>(null);

  // Handle clicks outside suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle clicks outside replacement suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        replacementSuggestionsRef.current &&
        !replacementSuggestionsRef.current.contains(event.target as Node)
      ) {
        setReplacingFood((prev) => ({ ...prev, showSuggestions: false }));
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const calculatedValues = useMemo<CalculatedValues>(
    () => computeMacros(personalInfo),
    [personalInfo],
  );

  // Derived: aggregate macros across all logged foods.
  const totalMacros = useMemo<TotalMacros>(() => {
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let calories = 0;

    meals.forEach((meal) => {
      meal.foods.forEach((food) => {
        protein += food.protein;
        carbs += food.carbs;
        fat += food.fat;
        calories += food.calories;
      });
    });

    return {
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      calories: Math.round(calories),
    };
  }, [meals]);

  /** Derived: optional macro-breakdown (sugars / fiber / fat subtypes).
   *  Returns only the keys at least one food in today's meals
   *  contributed — the display layer hides rows where we have no data
   *  so a blank seed-catalog entry doesn't render misleading "0g". */
  const macroBreakdown = useMemo(() => aggregateMacroBreakdown(meals), [meals]);

  // Handle personal info input changes. Accepts arrays so the multi-value
  // fields (cuisinePreferences, allergies, dislikedFoods) and MacroSplit
  // (the optional macro override) can all ride through the same path.
  const handlePersonalInfoChange = (
    name: string,
    value: string | number | null | string[] | MacroSplit,
  ) => {
    setPersonalInfo({ ...personalInfo, [name]: value });
  };

  // Handle food search input
  const handleFoodSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFoodSearch(e.target.value);
    setShowSuggestions(e.target.value.trim() !== "");
  };

  // Handle food selection from suggestions
  const handleFoodSelect = (food: Food) => {
    setSelectedFood(food);
    setFoodSearch(food.name);
    const ratio = portionSize / 100;
    // Helper: scale an optional per-100g sub-macro to the chosen
    // portion. Returns undefined when the source food doesn't carry a
    // value — preserved so the daily-totals breakdown can distinguish
    // "unknown" from "zero" downstream.
    const scaleOpt = (v: number | undefined) =>
      typeof v === "number"
        ? Number.parseFloat((v * ratio).toFixed(1))
        : undefined;
    setNewFood({
      ...newFood,
      name: food.name,
      protein: Number.parseFloat((food.protein * ratio).toFixed(1)),
      carbs: Number.parseFloat((food.carbs * ratio).toFixed(1)),
      fat: Number.parseFloat((food.fat * ratio).toFixed(1)),
      calories: Math.round(food.calories * ratio),
      sugars: scaleOpt(food.sugars),
      addedSugars: scaleOpt(food.addedSugars),
      fiber: scaleOpt(food.fiber),
      saturatedFat: scaleOpt(food.saturatedFat),
      transFat: scaleOpt(food.transFat),
      monoFat: scaleOpt(food.monoFat),
      polyFat: scaleOpt(food.polyFat),
    });
    setShowSuggestions(false);
  };

  // Save an OFF result to the user's custom foods. Reuses macros as-is.
  const handleSaveOffToCustom = async (food: Food) => {
    if (food.source !== "off") return;
    await addCustomFood({
      name: food.name,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      calories: food.calories,
      brand: food.brand,
    });
    bumpPending();
    setCustomFoodsRev((r) => r + 1);
  };

  // Called when the CustomFoodForm dialog successfully saves a new food.
  const handleCustomFoodSaved = (food: Food) => {
    setCustomFoodsRev((r) => r + 1);
    handleFoodSelect(food);
  };

  // Append a template's foods to the target meal. Each food gets a fresh
  /** Resolve a phone-side capture (delivered via PairPhoneDialog).
   *  Barcode → look up via OFF; photo → download from Storage, base64,
   *  send to /api/identify-meal. Both paths feed back into the same
   *  state the mobile-direct flow uses, so the downstream UI (search
   *  pick or MealPhotoReviewDialog) renders without further wiring. */
  const handlePairedCapture = async (
    payload:
      | { ready: true; kind: "barcode"; barcode: string }
      | { ready: true; kind: "photo"; photoPath: string },
  ) => {
    setMealPlanMessage("");
    try {
      if (payload.kind === "barcode") {
        const res = await fetch(
          `/api/off-barcode/${encodeURIComponent(payload.barcode)}`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `Lookup failed (HTTP ${res.status})`);
        }
        const data = (await res.json()) as { food?: Food };
        if (!data.food) throw new Error("OFF returned no food.");
        handleFoodSelect(data.food);
        // The food just dropped into the AddFoodForm below — without a
        // visible cue the user (still staring at the now-closed pair
        // dialog) thinks nothing happened. Scroll the form into view
        // and surface a confirmation in the status banner so the next
        // step (pick portion + meal) is obvious.
        setMealPlanMessage(
          `Scanned "${data.food.name}" — pick portion + meal below.`,
        );
        if (typeof document !== "undefined") {
          document
            .getElementById("add-food-form")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      // photo path: fetch the blob from Storage, base64 it, identify.
      const { getSupabaseBrowser } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase isn't configured.");
      const { data: blob, error: dlError } = await supabase.storage
        .from("captures")
        .download(payload.photoPath);
      if (dlError || !blob) {
        throw new Error(dlError?.message ?? "Photo download failed.");
      }
      const base64 = await blobToBase64(blob);
      // Load customs on demand — same pattern the in-sheet identify
      // flow uses; keeps the wire shape consistent.
      const { listCustomFoods: listFoods } = await import("./lib/db");
      const customs = await listFoods().catch(() => []);
      const aiRes = await fetch("/api/identify-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: "image/jpeg",
          dietPreference: personalInfo.dietPreference,
          customFoods: customs.map((c) => ({
            name: c.name,
            protein: c.protein,
            carbs: c.carbs,
            fat: c.fat,
            calories: c.calories,
            category: c.category,
            subCategory: c.subCategory,
            brand: c.brand,
            dietKind: c.dietKind,
          })),
        }),
      });
      if (!aiRes.ok) {
        const data = (await aiRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error ?? `Identification failed (HTTP ${aiRes.status})`,
        );
      }
      const result = (await aiRes.json()) as ResolvedMealPhoto;
      setMealPhotoResult(result);
    } catch (err) {
      setMealPlanMessage(
        err instanceof Error ? err.message : "Pair-capture handling failed.",
      );
    }
  };

  /** Append a list of FoodItems to a meal slot. Used by the
   *  MealPhotoReviewDialog after the user confirms the AI-identified
   *  foods. The FoodItems already have proper macros (the dialog
   *  scaled per-100g × user-adjusted grams), so we only need to
   *  re-mint ids to avoid collisions with other meal foods. */
  const handleBulkAddToMeal = (targetId: number, foods: FoodItem[]) => {
    let nextId = Date.now();
    const cloned = foods.map((f) => ({ ...f, id: nextId++ }));
    setMeals(
      meals.map((m) =>
        m.id === targetId ? { ...m, foods: [...m.foods, ...cloned] } : m,
      ),
    );
  };

  // local id so subsequent edits don't collide with the template's saved
  // foods or other meals' foods.
  const handleApplyTemplate = (template: MealTemplate) => {
    if (templateDialog?.kind !== "apply") return;
    const targetId = templateDialog.mealId;
    let nextId = Date.now();
    const cloned = template.foods.map((f) => ({ ...f, id: nextId++ }));
    setMeals(
      meals.map((m) =>
        m.id === targetId ? { ...m, foods: [...m.foods, ...cloned] } : m,
      ),
    );
  };

  // Expand a recipe's ingredients into the target meal slot as individual
  // FoodItems. Mirrors handleApplyTemplate but converts RecipeIngredient
  // (per-100g snapshot + portionGrams) into the per-portion FoodItem shape
  // the meal-planner expects. After apply, the user can adjust each
  // ingredient's portion independently through the existing slot UI.
  const handleApplyRecipe = (recipe: Recipe) => {
    if (applyRecipeMealId === null) return;
    const targetId = applyRecipeMealId;
    let nextId = Date.now();
    const cloned: FoodItem[] = recipe.ingredients.map((ing) => {
      const r = ing.portionGrams / 100;
      return {
        id: nextId++,
        name: ing.foodName,
        protein: Number.parseFloat((ing.macrosPer100g.protein * r).toFixed(1)),
        carbs: Number.parseFloat((ing.macrosPer100g.carbs * r).toFixed(1)),
        fat: Number.parseFloat((ing.macrosPer100g.fat * r).toFixed(1)),
        calories: Math.round(ing.macrosPer100g.calories * r),
        portionSize: ing.portionGrams,
        originalValues: {
          proteinPer100g: ing.macrosPer100g.protein,
          carbsPer100g: ing.macrosPer100g.carbs,
          fatPer100g: ing.macrosPer100g.fat,
          caloriesPer100g: ing.macrosPer100g.calories,
        },
      };
    });
    setMeals(
      meals.map((m) =>
        m.id === targetId ? { ...m, foods: [...m.foods, ...cloned] } : m,
      ),
    );
    setApplyRecipeMealId(null);
  };

  // Handle portion size change
  const handlePortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseFloat(e.target.value);
    const newSize = Number.isNaN(parsed) ? 0 : parsed;
    setPortionSize(newSize);
    if (selectedFood) {
      const ratio = newSize / 100;
      setNewFood({
        ...newFood,
        protein: Number.parseFloat((selectedFood.protein * ratio).toFixed(1)),
        carbs: Number.parseFloat((selectedFood.carbs * ratio).toFixed(1)),
        fat: Number.parseFloat((selectedFood.fat * ratio).toFixed(1)),
        calories: Math.round(selectedFood.calories * ratio),
      });
    }
  };

  // Handle new food input changes
  const handleFoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "protein" || name === "carbs" || name === "fat") {
      // Automatically calculate calories when macros change
      const updatedFood = { ...newFood, [name]: Number.parseFloat(value) || 0 };
      const calories =
        updatedFood.protein * 4 + updatedFood.carbs * 4 + updatedFood.fat * 9;

      setNewFood({ ...updatedFood, calories: Math.round(calories) });
    } else if (name === "calories") {
      setNewFood({ ...newFood, calories: Number.parseFloat(value) || 0 });
    } else {
      setNewFood({ ...newFood, [name]: value });
    }
  };

  // Add a new food to a meal
  const addFood = () => {
    // Use foodSearch instead of newFood.name for checking
    if (foodSearch.trim() === "") return;

    const updatedMeals = meals.map((meal) => {
      if (
        meal.id === Number.parseInt(newFood.selectedMealId?.toString() || "0")
      ) {
        return {
          ...meal,
          foods: [
            ...meal.foods,
            {
              ...newFood,
              name: foodSearch,
              id: Date.now(),
              portionSize: portionSize,
              originalValues: {
                proteinPer100g: newFood.protein / (portionSize / 100),
                carbsPer100g: newFood.carbs / (portionSize / 100),
                fatPer100g: newFood.fat / (portionSize / 100),
                caloriesPer100g: newFood.calories / (portionSize / 100),
              },
            },
          ],
        };
      }
      return meal;
    });

    setMeals(updatedMeals);

    // Reset the new food form
    setNewFood({
      id: 0,
      name: "",
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      portionSize: 0,
      selectedMealId: newFood.selectedMealId,
    });
    setFoodSearch("");
    setPortionSize(100);
  };

  // Remove a food from a meal
  const removeFood = (mealId: number, foodId: number) => {
    const updatedMeals = meals.map((meal) => {
      if (meal.id === mealId) {
        return {
          ...meal,
          foods: meal.foods.filter((food) => food.id !== foodId),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
  };

  // Drag-and-drop: move a food to a different meal, optionally to a
  // specific index. When `destIndex` is omitted, the food lands at the
  // end of the destination meal. Within-meal moves with the same index
  // are a no-op (avoids spurious setMeals on accidental clicks).
  const moveFood = (
    srcMealId: number,
    destMealId: number,
    foodId: number,
    destIndex?: number,
  ) => {
    const src = meals.find((m) => m.id === srcMealId);
    if (!src) return;
    const food = src.foods.find((f) => f.id === foodId);
    if (!food) return;

    const sameMeal = srcMealId === destMealId;
    const fromIndex = src.foods.findIndex((f) => f.id === foodId);
    if (sameMeal && (destIndex === undefined || destIndex === fromIndex)) {
      return;
    }

    setMeals(
      meals.map((meal) => {
        if (sameMeal && meal.id === srcMealId) {
          const next = src.foods.filter((f) => f.id !== foodId);
          const insertAt = Math.min(destIndex ?? next.length, next.length);
          next.splice(insertAt, 0, food);
          return { ...meal, foods: next };
        }
        if (meal.id === srcMealId) {
          return { ...meal, foods: meal.foods.filter((f) => f.id !== foodId) };
        }
        if (meal.id === destMealId) {
          const next = [...meal.foods];
          const insertAt = Math.min(destIndex ?? next.length, next.length);
          next.splice(insertAt, 0, food);
          return { ...meal, foods: next };
        }
        return meal;
      }),
    );
  };

  // Start editing a food's portion size
  const startEditingFood = (mealId: number, food: FoodItem) => {
    setEditingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      originalFood: food,
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      originalFood: null,
    });
  };

  // Handle portion size change during editing
  const handleEditPortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(1, Number.parseInt(e.target.value) || 0);
    setEditingFood({ ...editingFood, portionSize: newSize });
  };

  // Save edited portion size
  const saveEditedPortion = () => {
    const originalFood = editingFood.originalFood;
    if (!originalFood) return;

    // Prefer the per-100g values captured at add-time (works for builtin,
    // custom, and OFF foods). Fall back to a builtin lookup for legacy
    // entries that pre-date the originalValues capture.
    let proteinPer100g: number | undefined;
    let carbsPer100g: number | undefined;
    let fatPer100g: number | undefined;
    let caloriesPer100g: number | undefined;
    if (originalFood.originalValues) {
      ({ proteinPer100g, carbsPer100g, fatPer100g, caloriesPer100g } =
        originalFood.originalValues);
    } else {
      const dbFood = foodDatabase.find((f) => f.name === originalFood.name);
      if (!dbFood) {
        cancelEditing();
        return;
      }
      proteinPer100g = dbFood.protein;
      carbsPer100g = dbFood.carbs;
      fatPer100g = dbFood.fat;
      caloriesPer100g = dbFood.calories;
    }

    const ratio = editingFood.portionSize / 100;
    const updatedFood = {
      ...originalFood,
      portionSize: editingFood.portionSize,
      protein: Number.parseFloat((proteinPer100g * ratio).toFixed(1)),
      carbs: Number.parseFloat((carbsPer100g * ratio).toFixed(1)),
      fat: Number.parseFloat((fatPer100g * ratio).toFixed(1)),
      calories: Math.round(caloriesPer100g * ratio),
    };

    // Update the food in the meal
    const updatedMeals = meals.map((meal) => {
      if (meal.id === editingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) =>
            food.id === editingFood.foodId ? updatedFood : food,
          ),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
    cancelEditing();
  };

  // Start replacing a food
  const startReplacingFood = (mealId: number, food: FoodItem) => {
    setReplacingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    });
  };

  // Cancel replacing
  const cancelReplacing = () => {
    setReplacingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    });
  };

  // Handle food search for replacement
  const handleReplacementSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;

    setReplacingFood((prev) => ({
      ...prev,
      searchTerm,
      showSuggestions: searchTerm.trim() !== "",
    }));

    if (searchTerm.trim() === "") {
      setReplacingFood((prev) => ({
        ...prev,
        suggestions: [],
        showSuggestions: false,
      }));
      return;
    }

    // Filter foods based on search term
    const filteredFoods = foodDatabase
      .filter((food) =>
        food.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
      .slice(0, 5); // Limit to 5 suggestions

    setReplacingFood((prev) => ({
      ...prev,
      suggestions: filteredFoods,
      showSuggestions: true,
    }));
  };

  // Replace a food with a new one
  const replaceFood = (newFood: Food) => {
    // Calculate the ratio based on the portion size
    const ratio = replacingFood.portionSize / 100;

    // Create new food object with calculated macros
    const replacementFood = {
      id: Date.now() + Math.random(),
      name: newFood.name,
      protein: Number.parseFloat((newFood.protein * ratio).toFixed(1)),
      carbs: Number.parseFloat((newFood.carbs * ratio).toFixed(1)),
      fat: Number.parseFloat((newFood.fat * ratio).toFixed(1)),
      calories: Math.round(newFood.calories * ratio),
      portionSize: replacingFood.portionSize,
      category: newFood.category,
      subCategory: newFood.subCategory,
      originalValues: {
        proteinPer100g: newFood.protein,
        carbsPer100g: newFood.carbs,
        fatPer100g: newFood.fat,
        caloriesPer100g: newFood.calories,
      },
    };

    // Update meals state by replacing the old food with the new one
    const updatedMeals = meals.map((meal) => {
      if (meal.id === replacingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) =>
            food.id === replacingFood.foodId ? replacementFood : food,
          ),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
    cancelReplacing();
  };

  // Generate a full day meal plan that hits the daily macro targets.
  // Try the AI route first (when configured + user signed in) for more
  // coherent food combinations; fall back to the deterministic 3×3
  // Cramer-based planner on any failure path — see lib/meal-planner.ts.
  const generateMealPlan = async () => {
    setIsGeneratingMealPlan(true);
    setMealPlanMessage("Generating your personalized meal plan...");
    try {
      // Pull saved custom foods (silent if IndexedDB is unavailable).
      let customFoods: Food[] = [];
      try {
        const rows = await listCustomFoods();
        customFoods = rows.map(customToFood);
      } catch {
        // Fine — proceed with builtin only.
      }

      const daily = {
        protein: calculatedValues.protein,
        carbs: calculatedValues.carbs,
        fat: calculatedValues.fat,
        calories: calculatedValues.targetCalories,
      };

      // Try the AI route first. Errors here are non-fatal — they fall
      // through to the deterministic planner below.
      const ai = await requestAiMealPlan({
        targets: daily,
        dietPreference: personalInfo.dietPreference,
        mealNames: meals.map((m) => m.name),
        customFoods,
        cuisinePreferences: personalInfo.cuisinePreferences ?? [],
        allergies: personalInfo.allergies ?? [],
        dislikedFoods: personalInfo.dislikedFoods ?? [],
      });

      if (ai.kind === "ok") {
        setMeals(ai.meals);
        const summary = summarisePlan(ai.meals, daily);
        const fmt = (n: number) => `${Math.round(n)}%`;
        const base = `AI plan — P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)} of target.`;
        const issuesNote = formatCoherenceNote(ai.coherenceIssues);
        setMealPlanMessage(base + issuesNote);
        // Linger longer when there's a quality warning so the user has
        // time to actually read which meals need fixing.
        setTimeout(() => setMealPlanMessage(""), issuesNote ? 12000 : 5000);
        return;
      }

      // Yield once so the spinner paints before the synchronous solve.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const planned = planDay(meals, foodDatabase, daily, {
        customFoods,
        dietPreference: personalInfo.dietPreference,
      });
      const summary = summarisePlan(planned, daily);

      setMeals(planned);

      const fmt = (n: number) => `${Math.round(n)}%`;
      // Lead the message with the *reason* AI was skipped — silent
      // fallback is confusing if the user expected the AI to fire.
      const prefix =
        ai.kind === "not-configured"
          ? "AI not configured — used formula. "
          : ai.kind === "not-authenticated"
            ? "Sign in to use AI planning — used formula. "
            : ai.kind === "rate-limited"
              ? "AI rate-limited — used formula. "
              : ai.kind === "error"
                ? `AI failed (${ai.message}) — used formula. `
                : "";
      const tail = summary.withinTolerance
        ? `Plan hits P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)} of target.`
        : `Plan within reach — P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)}. Limited by available foods.`;
      setMealPlanMessage(prefix + tail);
      setTimeout(() => setMealPlanMessage(""), 6000);
    } catch (error) {
      setMealPlanMessage("Error generating meal plan. Please try again.");
      console.error("Meal plan generation error:", error);
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  /** Apply a one-shot refinement (from a refiner pill) to the current
   *  meal plan. Shares the `isGeneratingMealPlan` busy state with the
   *  Auto-fill button — only one AI call is in flight at a time, which
   *  the route also guards by being non-reentrant. Failures surface in
   *  `mealPlanMessage`; the existing meals are left untouched on
   *  error. */
  const handleRefineMealPlan = async (refinement: string) => {
    if (isGeneratingMealPlan) return;
    setIsGeneratingMealPlan(true);
    setMealPlanMessage("Refining your meal plan…");
    try {
      let customFoods: Food[] = [];
      try {
        const rows = await listCustomFoods();
        customFoods = rows.map(customToFood);
      } catch {
        // Proceed with builtins only.
      }
      const daily = {
        protein: calculatedValues.protein,
        carbs: calculatedValues.carbs,
        fat: calculatedValues.fat,
        calories: calculatedValues.targetCalories,
      };
      const ai = await requestAiMealPlan({
        targets: daily,
        dietPreference: personalInfo.dietPreference,
        mealNames: meals.map((m) => m.name),
        customFoods,
        cuisinePreferences: personalInfo.cuisinePreferences ?? [],
        allergies: personalInfo.allergies ?? [],
        dislikedFoods: personalInfo.dislikedFoods ?? [],
        refinement,
        previousMeals: meals,
      });
      if (ai.kind === "ok") {
        setMeals(ai.meals);
        const summary = summarisePlan(ai.meals, daily);
        const fmt = (n: number) => `${Math.round(n)}%`;
        const base = `Refined — P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)} of target.`;
        const issuesNote = formatCoherenceNote(ai.coherenceIssues);
        setMealPlanMessage(base + issuesNote);
        setTimeout(() => setMealPlanMessage(""), issuesNote ? 12000 : 5000);
        return;
      }
      // Unlike Auto-fill, we don't fall back to the deterministic
      // planner for refinements — it has no notion of free-text
      // constraints. Just surface the failure and leave the plan as-is.
      const msg =
        ai.kind === "not-configured"
          ? "AI not configured — refinement skipped."
          : ai.kind === "not-authenticated"
            ? "Sign in to use AI refinements."
            : ai.kind === "rate-limited"
              ? "AI rate-limited — try again shortly."
              : ai.kind === "error"
                ? `Refinement failed: ${ai.message}`
                : "Refinement failed.";
      setMealPlanMessage(msg);
    } catch (error) {
      setMealPlanMessage("Error refining meal plan. Please try again.");
      console.error("Meal plan refinement error:", error);
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  /** Per-meal regeneration — the user clicks the sparkles button on a
   *  single meal slot. The AI returns ONLY that meal (with name set to
   *  the slot's name); we replace just that slot's foods. The rest of
   *  the day's meals are passed as context so the AI doesn't propose
   *  something culinarily clashing with what's around it. */
  const handleRegenerateMeal = async (mealId: number) => {
    if (isGeneratingMealPlan) return;
    const target = meals.find((m) => m.id === mealId);
    if (!target) return;
    setIsGeneratingMealPlan(true);
    setMealPlanMessage(`Regenerating ${target.name}…`);
    try {
      let customFoods: Food[] = [];
      try {
        const rows = await listCustomFoods();
        customFoods = rows.map(customToFood);
      } catch {
        // Proceed with builtins only.
      }
      const daily = {
        protein: calculatedValues.protein,
        carbs: calculatedValues.carbs,
        fat: calculatedValues.fat,
        calories: calculatedValues.targetCalories,
      };
      const ai = await requestAiMealPlan({
        targets: daily,
        dietPreference: personalInfo.dietPreference,
        mealNames: meals.map((m) => m.name),
        customFoods,
        cuisinePreferences: personalInfo.cuisinePreferences ?? [],
        allergies: personalInfo.allergies ?? [],
        dislikedFoods: personalInfo.dislikedFoods ?? [],
        previousMeals: meals,
        targetMealName: target.name,
      });
      if (ai.kind === "ok") {
        // The AI was told to return exactly one meal. Match by name
        // (case-insensitive) so a stray model quirk doesn't drop the
        // payload. If for some reason multiple meals came back, take
        // the first one matching the target.
        const replacement = ai.meals.find(
          (m) => m.name.toLowerCase() === target.name.toLowerCase(),
        );
        if (replacement) {
          setMeals(
            meals.map((m) =>
              m.id === target.id ? { ...m, foods: replacement.foods } : m,
            ),
          );
          setMealPlanMessage(`Regenerated ${target.name}.`);
          setTimeout(() => setMealPlanMessage(""), 4000);
          return;
        }
        setMealPlanMessage(
          `AI didn't return a ${target.name} meal — try again.`,
        );
        return;
      }
      const msg =
        ai.kind === "not-configured"
          ? "AI not configured — regeneration skipped."
          : ai.kind === "not-authenticated"
            ? "Sign in to use AI regeneration."
            : ai.kind === "rate-limited"
              ? "AI rate-limited — try again shortly."
              : ai.kind === "error"
                ? `Regeneration failed: ${ai.message}`
                : "Regeneration failed.";
      setMealPlanMessage(msg);
    } catch (error) {
      setMealPlanMessage(`Error regenerating ${target.name}. Try again.`);
      console.error("Meal regeneration error:", error);
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  return (
    <AppShell
      current={view}
      onSelect={setView}
    >
      {view === "calculator" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PersonalInfoForm
              personalInfo={personalInfo}
              onPersonalInfoChange={handlePersonalInfoChange}
            />
          </div>
          <div className="lg:col-span-2">
            <MacroResults
              calculatedValues={calculatedValues}
              totalMacros={totalMacros}
            />
          </div>
        </div>
      )}

      {view === "plan" && (
        <MealPlanner
          calculatedValues={calculatedValues}
          totalMacros={totalMacros}
          macroBreakdown={macroBreakdown}
          meals={meals}
          selectedDate={selectedDate}
          today={today}
          onSelectDate={(d) => setExplicitDate(d === today ? null : d)}
          newFood={newFood}
          foodSearch={foodSearch}
          foodSuggestions={foodSuggestions}
          showSuggestions={showSuggestions}
          isSearchingRemote={search.isSearchingRemote}
          portionSize={portionSize}
          isGeneratingMealPlan={isGeneratingMealPlan}
          mealPlanMessage={mealPlanMessage}
          editingFood={editingFood}
          replacingFood={replacingFood}
          suggestionsRef={suggestionsRef}
          replacementSuggestionsRef={replacementSuggestionsRef}
          setNewFood={setNewFood}
          setFoodSearch={setFoodSearch}
          setPortionSize={setPortionSize}
          handleFoodSearch={handleFoodSearch}
          handleFoodSelect={handleFoodSelect}
          handlePortionChange={handlePortionChange}
          handleFoodChange={handleFoodChange}
          addFood={addFood}
          removeFood={removeFood}
          moveFood={moveFood}
          startEditingFood={startEditingFood}
          cancelEditing={cancelEditing}
          handleEditPortionChange={handleEditPortionChange}
          saveEditedPortion={saveEditedPortion}
          startReplacingFood={startReplacingFood}
          cancelReplacing={cancelReplacing}
          handleReplacementSearch={handleReplacementSearch}
          replaceFood={replaceFood}
          generateMealPlan={generateMealPlan}
          onRefineMealPlan={handleRefineMealPlan}
          onRegenerateMeal={handleRegenerateMeal}
          onSaveOffToCustom={handleSaveOffToCustom}
          onOpenCustomFoodForm={() => setCustomFoodOpen(true)}
          onOpenCamera={() => setCameraSheetOpen(true)}
          onSaveAsTemplate={(mealId) =>
            setTemplateDialog({ kind: "save", mealId })
          }
          onAddFromTemplate={(mealId) =>
            setTemplateDialog({ kind: "apply", mealId })
          }
          onApplyRecipe={(mealId) => setApplyRecipeMealId(mealId)}
        />
      )}

      {view === "progress" && (
        <ProgressView targetCalories={calculatedValues.targetCalories} />
      )}

      {view === "foods" && (
        <MyFoodsView onChange={() => setCustomFoodsRev((r) => r + 1)} />
      )}

      {view === "recipes" && <RecipesView profile={personalInfo} />}

      {view === "templates" && <TemplatesView />}

      {view === "settings" && <SettingsView />}

      <CameraSheet
        open={cameraSheetOpen}
        onOpenChange={setCameraSheetOpen}
        aiAvailable={!!user}
        dietPreference={personalInfo.dietPreference}
        pairPhoneAvailable={!!user && !isMobile}
        onFoodPicked={handleFoodSelect}
        onMealPhotoResolved={(result) => setMealPhotoResult(result)}
        onSwitchToPairPhone={() => setPairPhoneOpen(true)}
      />

      <PairPhoneDialog
        open={pairPhoneOpen}
        onOpenChange={setPairPhoneOpen}
        onCaptureReady={(payload) => {
          void handlePairedCapture(payload);
        }}
      />

      <MealPhotoReviewDialog
        open={mealPhotoResult !== null}
        onOpenChange={(o) => {
          if (!o) setMealPhotoResult(null);
        }}
        result={mealPhotoResult}
        meals={meals}
        onConfirm={(mealId, foods, newCustomFoods) => {
          // Persist the AI-estimated foods first so they're indexed for
          // the next time the user photographs the same item. addCustomFood
          // resolves async but the IDB write is durable; bump the rev so
          // the search list refreshes after navigation.
          if (newCustomFoods.length > 0) {
            (async () => {
              for (const c of newCustomFoods) {
                await addCustomFood({
                  name: c.name,
                  protein: c.protein,
                  carbs: c.carbs,
                  fat: c.fat,
                  calories: c.calories,
                  dietKind: c.dietKind,
                });
              }
              bumpPending();
              setCustomFoodsRev((r) => r + 1);
            })();
          }
          handleBulkAddToMeal(mealId, foods);
          setMealPhotoResult(null);
        }}
      />

      <CustomFoodForm
        open={customFoodOpen}
        onOpenChange={setCustomFoodOpen}
        onSaved={handleCustomFoodSaved}
      />

      <SaveTemplateDialog
        open={templateDialog?.kind === "save"}
        onOpenChange={(o) => {
          if (!o) setTemplateDialog(null);
        }}
        foods={
          templateDialog?.kind === "save"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.foods ?? [])
            : []
        }
        defaultName={
          templateDialog?.kind === "save"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.name ??
              "Meal")
            : "Meal"
        }
        onSaved={() => setTemplateDialog(null)}
      />

      <ApplyTemplateDialog
        open={templateDialog?.kind === "apply"}
        onOpenChange={(o) => {
          if (!o) setTemplateDialog(null);
        }}
        targetMealName={
          templateDialog?.kind === "apply"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.name ??
              "Meal")
            : "Meal"
        }
        onApply={handleApplyTemplate}
      />

      <ApplyRecipeDialog
        open={applyRecipeMealId !== null}
        onOpenChange={(o) => {
          if (!o) setApplyRecipeMealId(null);
        }}
        targetMealName={
          applyRecipeMealId !== null
            ? (meals.find((m) => m.id === applyRecipeMealId)?.name ?? "Meal")
            : "Meal"
        }
        dietPreference={personalInfo.dietPreference}
        onApply={handleApplyRecipe}
      />
    </AppShell>
  );
};

export default MacroCalculator;
